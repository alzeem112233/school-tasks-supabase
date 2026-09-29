export function createAuthView(getContext) {
  function renderLogin() {
    const { app, cloud, state, safe, icons } = getContext();
    app.innerHTML = `
      <section class="login-page">
        <div class="login-card">
          <div class="login-visual">
            <div class="login-logo-panel">
              <img src="/school-tasks-logo.jpeg" alt="منصة المهام المدرسية" />
            </div>
            <div><h1>صلاحيات آمنة ومسارات اعتماد واضحة ومتابعة لحظية للأعمال.</h1><p>يدعم النظام الأقسام وأرقام المهام والتعليقات ومتابعة الاستحقاقات ومركز التنبيهات.</p></div>
          </div>
          <form class="login-form" onsubmit="actions.login(event)">
            <div class="login-form-brand">
              <img src="/icon-192.png" alt="" />
              <div><h2>تسجيل الدخول</h2><p class="muted">${cloud.enabled ? "استخدم البريد الإلكتروني وكلمة المرور الخاصة بحسابك." : "تعذر تشغيل خدمات Supabase أو لم يكتمل إعدادها بعد."}</p>${state.startupError ? `<p class="muted" style="color:#b91c1c;">${safe(state.startupError)}</p>` : ""}</div>
            </div>
            ${state.loginError ? `<div class="feedback" style="background:#fee2e2; color:#991b1b; border:1px solid #fecaca;"><strong>تعذر تسجيل الدخول</strong><p>${safe(state.loginError)}</p></div>` : ""}
            <label class="field"><span>البريد الإلكتروني</span><input name="email" type="email" autocomplete="username" placeholder="أدخل بريدك الإلكتروني" required /></label>
            <label class="field"><span>كلمة المرور</span><input name="password" type="password" autocomplete="current-password" placeholder="أدخل كلمة المرور" required /></label>
            <div class="feedback" style="font-size:14px;"><strong>معلومة سريعة</strong><p>استخدم بريدك الإلكتروني وكلمة المرور الخاصة بحسابك. إذا استمرت المشكلة، اضغط زر تنظيف النسخة المخزنة ثم جرّب مرة أخرى.</p></div>
            <div class="actions"><button class="btn" type="submit" ${state.loginBusy ? "disabled" : ""}>${icons.check} ${state.loginBusy ? "جارٍ تسجيل الدخول..." : "دخول"}</button><button class="btn" type="button" onclick="actions.clearCachedVersionAndReload()" ${state.loginBusy ? "disabled" : ""}>${icons.database} تنظيف النسخة المخزنة</button></div>
            <div class="demo-users">أنشئ الحسابات من داخل النظام بعد تسجيل الدخول. يُنشأ ملف الحساب تلقائيًا وبحالة غير نشطة، ثم يحدد المسؤول المدرسة والدور المناسبين.</div>
          </form>
        </div>
      </section>
      ${state.toast ? `<div class="toast">${safe(state.toast)}</div>` : ""}
    `;
  }

  function renderPending() {
    const { app, state, safe, icons } = getContext();
    app.innerHTML = `<section class="login-page"><div class="panel" style="width:min(620px, 100%); padding:24px;"><div class="section-title"><h2>جارٍ فتح الحساب</h2><p class="muted">تم قبول بيانات الدخول، وجارٍ الآن التحقق من ملف المستخدم وفتح لوحة التحكم.</p></div><div class="feedback" style="margin-top:16px;"><strong>جاري التحقق</strong><p class="muted">إذا استمرت هذه الشاشة، يمكنك تسجيل الخروج ثم المحاولة من جديد.</p></div><div class="actions" style="margin-top:16px;"><button class="btn danger" type="button" onclick="actions.logout()">${icons.close} تسجيل الخروج</button><button class="btn secondary" type="button" onclick="actions.clearCachedVersionAndReload()">${icons.database} تنظيف النسخة المخزنة</button></div></div></section>${state.toast ? `<div class="toast">${safe(state.toast)}</div>` : ""}`;
  }

  function renderProfileError() {
    const { app, state, safe, icons } = getContext();
    app.innerHTML = `<section class="login-page"><div class="panel" style="width:min(620px, 100%); padding:24px;"><div class="section-title"><h2>يلزم استكمال إعداد الحساب</h2><p class="muted">${safe(state.profileError || "تم تسجيل الدخول، لكن لم يتم العثور على ملف مستخدم مطابق أو أن الحساب غير نشط.")}</p></div><div class="actions" style="margin-top:16px;"><button class="btn" onclick="actions.retryProfileLoad()">${icons.refresh} إعادة المحاولة</button><button class="btn secondary" onclick="actions.clearCachedVersionAndReload()">${icons.database} تنظيف النسخة المخزنة</button><button class="btn danger" onclick="actions.logout()">${icons.close} تسجيل الخروج</button></div></div></section>`;
  }

  function renderSetupRequired() {
    const { app, state, safe } = getContext();
    app.innerHTML = `<section class="login-page"><div class="panel setup-panel"><div class="section-title"><h2>يلزم إعداد بيئة التشغيل</h2><p class="muted">${safe(state.startupError || "يجب ربط خدمات المصادقة وقاعدة البيانات والتخزين قبل الاستخدام.")}</p></div><div class="feedback setup-instructions"><strong>المطلوب قبل التشغيل</strong><p class="muted">أنشئ ملف الإعداد المحلي وأضف المتغيرين العامين التاليين:</p><div class="setup-values" dir="ltr"><code>VITE_SUPABASE_URL</code><code>VITE_SUPABASE_ANON_KEY</code></div><p class="muted">بعد ذلك طبّق مخطط قاعدة البيانات وسياسات الحماية.</p></div></div></section>`;
  }

  return { renderLogin, renderPending, renderProfileError, renderSetupRequired };
}
