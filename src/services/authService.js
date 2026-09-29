export function createAuthModule(getContext) {
  async function getCurrentSession() {
    const { cloud } = getContext();
    if (!cloud.enabled || !cloud.client) return { data: { session: null }, error: null };
    return cloud.client.auth.getSession();
  }

  function listenToAuthStateChanges(callback) {
    const { cloud } = getContext();
    if (!cloud.enabled || !cloud.client) return null;
    const { data } = cloud.client.auth.onAuthStateChange(callback);
    return data.subscription;
  }

  function formatLoginError(error) {
    const code = String(error?.code || error?.status || "");
    const message = String(error?.message || "").toLowerCase();
    if (message.includes("email logins are disabled")) {
      return "تسجيل الدخول بالبريد الإلكتروني وكلمة المرور غير مفعّل في Supabase Auth.";
    }
    if (message.includes("banned") || message.includes("disabled") || code === "user_banned") {
      return "هذا الحساب معطّل. يرجى التواصل مع مسؤول المدرسة.";
    }
    if (message.includes("invalid login credentials") || message.includes("invalid email") || code === "400") {
      return "البريد الإلكتروني أو كلمة المرور غير صحيحة.";
    }
    if (code === "429" || message.includes("rate limit")) {
      return "تمت محاولات كثيرة. انتظر قليلًا ثم حاول مرة أخرى أو غيّر كلمة المرور.";
    }
    if (message.includes("failed to fetch") || message.includes("network")) {
      return "تعذر الاتصال بخدمة تسجيل الدخول. تحقق من الإنترنت ثم أعد المحاولة.";
    }
    if (code === "401" || message.includes("api key")) {
      return "إعدادات Supabase داخل الموقع غير صحيحة.";
    }
    if (code === "auth/request-timeout") {
      return "تأخر رد خدمة تسجيل الدخول. حاول مرة أخرى، وإن تكرر ذلك اضغط زر تنظيف النسخة المخزنة.";
    }
    return `تعذر تسجيل الدخول حاليًا. ${code || "سبب غير معروف."}`;
  }

  function withTimeout(promise, ms) {
    let timerId = null;
    const timeoutPromise = new Promise((_, reject) => {
      timerId = window.setTimeout(() => reject({ code: "auth/request-timeout" }), ms);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
      if (timerId) window.clearTimeout(timerId);
    });
  }

  function authLoginEndpoint() {
    const isNativeApp = Boolean(window.__SCHOOL_TASKS_NATIVE__);
    return isNativeApp ? "https://school-tasks-supabase.vercel.app/api/auth-login" : "/api/auth-login";
  }

  async function signInWithRest(email, password) {
    const response = await fetch(authLoginEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      mode: "cors",
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error_description || data.msg || data.message || "تعذر تسجيل الدخول.");
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async function applyProxyLogin(data) {
    const { cloud, state, users, supabase, render } = getContext();
    if (!data.profile) {
      state.loginBusy = false;
      state.profileError = "تم تسجيل الدخول بنجاح، لكن لا يوجد ملف مستخدم مطابق داخل جدول profiles.";
      render();
      return false;
    }
    const profile = users.normalizeUser(supabase.fromDatabaseRow("users", data.profile));
    const { data: sessionData, error: sessionError } = await cloud.client.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });
    if (sessionError) throw sessionError;
    cloud.authUser = sessionData?.session?.user || data.user || null;
    state.currentUser = profile;
    state.offlineQueue = [];
    supabase.loadOfflineQueue();
    state.loginBusy = false;
    state.loginError = "";
    state.profileError = "";
    supabase.cacheProfile(profile);
    render();
    try {
      await supabase.startScopedListeners(state.currentUser);
    } catch (dataError) {
      console.warn("تعذر تحميل البيانات مباشرة من Supabase بعد تسجيل الدخول.", dataError);
    }
    return true;
  }

  async function login(event) {
    event.preventDefault();
    const { cloud, state, showToast, render } = getContext();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email")).trim().toLowerCase();
    const password = String(form.get("password")).trim();

    state.loginError = "";
    state.profileError = "";

    if (!cloud.enabled) {
      state.loginError = "التطبيق يعمل في وضع إنتاجي فقط بعد إكمال إعداد Supabase.";
      render();
      showToast(state.loginError);
      return;
    }

    if (!email || !password) {
      state.loginError = "أدخل البريد الإلكتروني وكلمة المرور أولًا.";
      render();
      showToast(state.loginError);
      return;
    }

    state.loginBusy = true;
    render();

    try {
      const proxyData = await withTimeout(signInWithRest(email, password), 18000);
      const proxyApplied = await applyProxyLogin(proxyData);
      if (!proxyApplied) return;
      state.view = "home";
      render();
      return;
    } catch (proxyError) {
      try {
      const { data, error } = await withTimeout(cloud.client.auth.signInWithPassword({ email, password }), 12000);
      if (error) throw error;
      if (data?.user?.id) {
        cloud.authUser = data.user;
        await getContext().supabase.loadProfile(data.user.id);
      }
      try {
        await getContext().supabase.callFunction("logLogin", {});
      } catch (logError) {
        console.error("Login audit failed", logError);
      }
      state.view = "home";
      render();
      } catch (error) {
      if (proxyError?.status) error = proxyError;
      const message = String(error?.message || "").toLowerCase();
      if (message.includes("failed to fetch") || message.includes("network") || error?.code === "auth/request-timeout") {
        try {
          const data = await withTimeout(signInWithRest(email, password), 18000);
          const proxyApplied = await applyProxyLogin(data);
          if (!proxyApplied) return;
          try {
            await getContext().supabase.callFunction("logLogin", {});
          } catch (logError) {
            console.error("Login audit failed", logError);
          }
          state.view = "home";
          render();
          return;
        } catch (fallbackError) {
          console.error(fallbackError);
          error = fallbackError;
        }
      }
      console.error(error);
      state.loginBusy = false;
      state.loginError = formatLoginError(error);
      render();
      showToast(state.loginError);
      }
    }
  }

  async function logout() {
    const { cloud, state, render, supabase, showToast } = getContext();
    state.profileError = "";
    state.loginError = "";
    state.loginBusy = false;
    try {
      if (cloud.enabled) {
        const { error } = await cloud.client.auth.signOut({ scope: "local" });
        if (error) throw error;
      }
    } catch (error) {
      console.error(error);
      showToast("تعذر إنهاء الجلسة على الخادم، وتم إغلاقها محليًا.");
    } finally {
      supabase.clearCachedProfile();
      await supabase.clearProtectedState();
      cloud.authUser = null;
      state.view = "home";
      render();
    }
  }

  return {
    getCurrentSession,
    listenToAuthStateChanges,
    login,
    logout,
  };
}
