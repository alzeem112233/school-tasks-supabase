export async function initializeCapacitorPlatform({ state, actions, render, showToast }) {
  if (typeof window === "undefined") return { native: false, hideSplash: async () => {} };

  let Capacitor;
  try {
    ({ Capacitor } = await import("@capacitor/core"));
  } catch {
    return { native: false, hideSplash: async () => {} };
  }

  const native = Boolean(Capacitor?.isNativePlatform?.());
  document.documentElement.classList.toggle("capacitor-native", native);
  document.body.classList.toggle("capacitor-native", native);
  window.__SCHOOL_TASKS_NATIVE__ = native;
  if (!native) return { native: false, hideSplash: async () => {} };

  const [{ App }, { Keyboard }, { StatusBar }, { SplashScreen }, { Browser }] = await Promise.all([
    import("@capacitor/app").catch(() => ({})),
    import("@capacitor/keyboard").catch(() => ({})),
    import("@capacitor/status-bar").catch(() => ({})),
    import("@capacitor/splash-screen").catch(() => ({})),
    import("@capacitor/browser").catch(() => ({})),
  ]);

  async function applyNativeTheme(theme = "light") {
    const dark = theme === "dark";
    await StatusBar?.setBackgroundColor?.({ color: dark ? "#080F1D" : "#2563eb" }).catch(() => {});
    await StatusBar?.setStyle?.({ style: dark ? "LIGHT" : "DARK" }).catch(() => {});
  }

  window.__setNativeTheme = applyNativeTheme;
  await applyNativeTheme(document.documentElement.getAttribute("data-theme") || "light");

  const originalWindowOpen = typeof window.open === "function" ? window.open.bind(window) : null;

  function closeNativeReportViewer() {
    const viewer = document.querySelector("[data-native-report-viewer]");
    if (!viewer) return false;
    viewer.remove();
    document.body.classList.remove("native-report-open");
    return true;
  }

  function renderNativeReportViewer(html) {
    closeNativeReportViewer();
    const parsed = new DOMParser().parseFromString(String(html || ""), "text/html");
    const title = parsed.querySelector("title")?.textContent?.trim() || "التقرير";
    const reportStyles = [...parsed.querySelectorAll("style")]
      .map((style) => style.textContent || "")
      .join("\n");
    const reportBody = parsed.body?.innerHTML || String(html || "");

    const viewer = document.createElement("section");
    viewer.className = "native-report-viewer";
    viewer.setAttribute("data-native-report-viewer", "true");
    viewer.setAttribute("role", "dialog");
    viewer.setAttribute("aria-modal", "true");
    viewer.setAttribute("aria-label", title);
    viewer.innerHTML = `
      <div class="native-report-toolbar">
        <button class="btn secondary native-report-close" type="button">إغلاق</button>
        <strong>${title}</strong>
        <button class="btn native-report-print" type="button">طباعة</button>
      </div>
      <div class="native-report-body" data-native-report-body>
        <style>${reportStyles}</style>
        <div class="native-report-content">
          <article class="native-report-paper">${reportBody}</article>
        </div>
      </div>
    `;
    viewer.querySelector(".native-report-close")?.addEventListener("click", closeNativeReportViewer);
    viewer.querySelector(".native-report-print")?.addEventListener("click", () => window.print());
    document.body.appendChild(viewer);
    document.body.classList.add("native-report-open");
    viewer.querySelector("[data-native-report-body]")?.scrollTo?.({ top: 0, behavior: "instant" });
  }

  window.__closeNativeReportViewer = closeNativeReportViewer;
  window.open = (url = "", target = "", features = "") => {
    const nextUrl = String(url || "").trim();
    if (nextUrl) {
      return originalWindowOpen?.(nextUrl, target, features) || null;
    }
    let buffer = "";
    let closed = false;
    return {
      get closed() {
        return closed;
      },
      document: {
        open() {
          buffer = "";
        },
        write(chunk) {
          buffer += String(chunk || "");
        },
        close() {
          renderNativeReportViewer(buffer);
        },
      },
      focus() {},
      print() {
        window.print();
      },
      close() {
        closed = true;
        closeNativeReportViewer();
      },
    };
  };

  App?.addListener?.("backButton", ({ canGoBack }) => {
    const currentActions = typeof actions === "function" ? actions() : actions;
    if (closeNativeReportViewer()) {
      return;
    }
    if (state.modal) {
      currentActions?.closeModal?.();
      return;
    }
    if (state.mobileNavOpen) {
      currentActions?.toggleMobileNav?.();
      return;
    }
    if (state.view && state.view !== "home") {
      currentActions?.setView?.("home");
      return;
    }
    if (canGoBack) {
      window.history.back();
      return;
    }
    App?.exitApp?.();
  });

  Keyboard?.addListener?.("keyboardWillShow", () => {
    document.body.classList.add("keyboard-open");
  });
  Keyboard?.addListener?.("keyboardWillHide", () => {
    document.body.classList.remove("keyboard-open");
  });

  document.addEventListener("click", (event) => {
    const link = event.target?.closest?.("a[href]");
    if (!link) return;
    const href = link.getAttribute("href") || "";
    if (!/^https?:\/\//i.test(href)) return;
    const url = new URL(href, window.location.href);
    if (url.origin === "https://school-tasks-supabase.vercel.app") return;
    event.preventDefault();
    Browser?.open?.({ url: url.href }).catch(() => {
      window.open(url.href, "_blank", "noopener,noreferrer");
    });
  });

  window.addEventListener("error", () => {
    showToast?.("حدث خطأ في التطبيق. جرّب التحديث أو أعد فتح التطبيق.");
  });
  window.addEventListener("unhandledrejection", (event) => {
    if (window.__notificationPermissionBusy) {
      event.preventDefault?.();
      console.warn("تم منع رسالة الخطأ العامة أثناء طلب إذن التنبيهات", event.reason);
      return;
    }
    showToast?.("تعذر إكمال العملية. تحقق من الاتصال ثم حاول مرة أخرى.");
  });

  return {
    native,
    hideSplash: async () => SplashScreen?.hide?.().catch(() => {}),
    refresh: render,
  };
}
