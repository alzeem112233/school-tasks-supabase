import { validateUserInput } from "../utils/validationUtils.js";
import { createUserView } from "../components/users/userView.js";
import { generalRoles, normalizeRole } from "../utils/permissionUtils.js";
import { GENERAL_SCHOOL_ID, isGeneralSchoolId, sortSchools } from "../utils/schoolUtils.js";
import { createUuid } from "../utils/idUtils.js";

export function createUsersModule(getContext) {
  const avatarBucket = "profile-avatars";

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("تعذر قراءة الصورة."));
      reader.readAsDataURL(file);
    });
  }

  async function uploadProfileAvatar(file) {
    const { cloud, state } = getContext();
    if (!file) return "";
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("الصورة يجب أن تكون PNG أو JPG أو WEBP.");
    if (file.size > 2 * 1024 * 1024) throw new Error("حجم الصورة يجب ألا يتجاوز 2 ميجابايت.");
    if (!cloud.enabled) return readFileAsDataUrl(file);
    const extension = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${state.currentUser.id}/avatar-${Date.now()}.${extension}`;
    const storage = cloud.client.storage.from(avatarBucket);
    const { error } = await storage.upload(path, file, { upsert: true, contentType: file.type });
    if (error) throw error;
    return storage.getPublicUrl(path).data.publicUrl;
  }

  function formatCloudUserError(error, editing) {
    const code = String(error?.code || error?.status || "");
    const message = String(error?.message || "").toLowerCase();
    if (message.includes("already") || message.includes("registered")) {
      return "هذا البريد الإلكتروني مستخدم بالفعل.";
    }
    if (message.includes("password") && (message.includes("weak") || message.includes("least"))) {
      return "كلمة المرور ضعيفة. استخدم 6 أحرف أو أكثر.";
    }
    if (message.includes("email") && message.includes("invalid")) {
      return "البريد الإلكتروني غير صالح.";
    }
    if (code === "401" || code === "403" || code === "42501" || message.includes("permission") || message.includes("صلاحية")) {
      return editing ? "لا توجد صلاحية كافية لتعديل هذا المستخدم." : "لا توجد صلاحية كافية لإنشاء هذا المستخدم.";
    }
    return error?.message || (editing ? "تعذر تحديث المستخدم." : "تعذر إنشاء المستخدم.");
  }

  function normalizeUser(user) {
    return {
      id: user.id,
      name: user.name || "",
      email: (user.email || user.username || "").toLowerCase(),
      role: normalizeRole(user.role),
      schoolId: user.schoolId || "general",
      active: user.active !== false,
      createdAt: getContext().toDateKey(user.createdAt || user.createdAtTs || ""),
      updatedAt: getContext().toDateKey(user.updatedAt || ""),
      password: user.password || "",
      avatarUrl: user.avatarUrl || "",
      linkedSchoolIds: Array.isArray(user.linkedSchoolIds)
        ? user.linkedSchoolIds
        : Array.isArray(user.linked_school_ids)
          ? user.linked_school_ids
          : [],
      accessFlags: {
        createUser: user.accessFlags?.createUser ?? user.access_flags?.createUser ?? null,
        createTask: user.accessFlags?.createTask ?? user.access_flags?.createTask ?? null,
        createNotebook: user.accessFlags?.createNotebook ?? user.access_flags?.createNotebook ?? null,
      },
    };
  }

  function parseAccessFlag(value) {
    const normalized = String(value || "inherit");
    if (normalized === "allow") return true;
    if (normalized === "deny") return false;
    return null;
  }

  function normalizeSchool(school) {
    const name = String(school.name || "").trim();
    return {
      id: school.id || createUuid(),
      name,
      shortName: String(school.shortName || name.slice(0, 2) || "مد").trim(),
      status: school.status || "active",
      createdAt: getContext().toDateKey(school.createdAt || ""),
      updatedAt: getContext().toDateKey(school.updatedAt || ""),
    };
  }

  const view = createUserView(getContext);

  async function saveMyProfile(event) {
    event.preventDefault();
    const { state, cloud, showToast, supabase, persistLocal, render } = getContext();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const password = String(form.get("password") || "").trim();
    const avatarFile = form.get("avatar");
    if (!name) {
      showToast("اكتب الاسم أولًا.");
      return;
    }
    if (password && password.length < 6) {
      showToast("كلمة المرور يجب ألا تقل عن 6 أحرف.");
      return;
    }
    try {
      const avatarUrl = avatarFile instanceof File && avatarFile.size ? await uploadProfileAvatar(avatarFile) : "";
      if (cloud.enabled) {
        await supabase.callFunction("selfProfile", {
          name,
          ...(password ? { password } : {}),
          ...(avatarUrl ? { avatarUrl } : {}),
        });
      }
      const updatedUser = { ...state.currentUser, name, ...(avatarUrl ? { avatarUrl } : {}), ...(password ? { password } : {}) };
      state.currentUser = updatedUser;
      state.users = state.users.map((user) => (user.id === updatedUser.id ? { ...user, ...updatedUser } : user));
      state.modal = null;
      persistLocal();
      render();
      showToast(password ? "تم تحديث الملف الشخصي وتغيير كلمة المرور." : "تم تحديث الملف الشخصي.");
    } catch (error) {
      console.error(error);
      showToast(error?.message || "تعذر تحديث الملف الشخصي.");
    }
  }

  async function saveUser(event) {
    event.preventDefault();
    const { canCreateUsers, canEditUser, canAssignUserRole, state, roles, cloud, showToast, supabase, persistLocal, audit, notifications, render } = getContext();
    const form = new FormData(event.currentTarget);
    const id = String(form.get("id") || "").trim();
    const email = String(form.get("email")).trim().toLowerCase();
    const active = true;
    const selectedRole = String(form.get("role") || "");
    const selectedSchoolId = state.currentUser.role === "general_manager" ? String(form.get("schoolId")).trim() : state.currentUser.schoolId;
    const password = String(form.get("password") || "").trim();
    const previousUser = id ? state.users.find((item) => item.id === id) || null : null;
    const effectiveRole = selectedRole || previousUser?.role || "school_secretary";
    const canChangePassword = state.currentUser.role === "general_manager" || (state.currentUser.role === "computer_unit" && previousUser && canEditUser(previousUser));
    const linkedSchoolIds = [...new Set(form.getAll("linkedSchoolIds").map((item) => String(item || "").trim()).filter(Boolean))];
    const schoolId = generalRoles.includes(effectiveRole) ? GENERAL_SCHOOL_ID : effectiveRole === "tracker" ? (selectedSchoolId || linkedSchoolIds[0] || "") : selectedSchoolId;
    const accessFlags = {
      createUser: parseAccessFlag(form.get("accessCreateUser")),
      createTask: parseAccessFlag(form.get("accessCreateTask")),
      createNotebook: parseAccessFlag(form.get("accessCreateNotebook")),
    };
    const user = normalizeUser({ id: id || createUuid(), name: String(form.get("name")).trim(), email, role: effectiveRole, schoolId, active, linkedSchoolIds: effectiveRole === "tracker" ? linkedSchoolIds : [], accessFlags });
    if (id ? !canEditUser(previousUser) : !canCreateUsers()) {
      showToast("لا توجد صلاحية كافية لتنفيذ هذا الإجراء.");
      return;
    }
    if (!generalRoles.includes(user.role) && isGeneralSchoolId(user.schoolId)) {
      showToast("اختر فرعًا للموظف. الإدارة العامة مخصصة لحسابات الإدارة العامة فقط.");
      return;
    }
    if (user.role === "tracker" && !user.linkedSchoolIds.length) {
      showToast("اختر فرعًا واحدًا على الأقل لحساب المتعقب.");
      return;
    }
    if (user.role === "tracker" && state.currentUser.role !== "general_manager") {
      showToast("حساب المتعقب لا يمكن إنشاؤه أو تعديله إلا من المدير العام.");
      return;
    }
    if (!canAssignUserRole(user.role, previousUser?.role || null)) {
      showToast("لا توجد صلاحية لتعيين هذا الدور أو تغييره.");
      return;
    }
    const validationError = validateUserInput(user, roles);
    if (validationError) {
      showToast(validationError);
      return;
    }
    if (state.currentUser.role !== "general_manager" && user.role === "general_manager") {
      showToast("فقط مدير الإدارة العامة يمكنه إسناد أدوار الإدارة العامة.");
      return;
    }
    const duplicate = state.users.some((item) => item.email === user.email && item.id !== user.id);
    if (duplicate) {
      showToast("هذا البريد الإلكتروني مستخدم بالفعل.");
      return;
    }
    if (id && password && !canChangePassword) {
      showToast("لا توجد صلاحية لتغيير كلمة مرور هذا المستخدم.");
      return;
    }
    if (password && password.length < 6) {
      showToast("كلمة المرور يجب ألا تقل عن 6 أحرف.");
      return;
    }
    if (cloud.enabled) {
      try {
        if (id) {
          const result = await supabase.callFunction("manage-user", {
            id: user.id,
            name: user.name,
            email: previousUser?.email || user.email,
            role: user.role,
            schoolId: user.schoolId,
            active: user.active,
            linkedSchoolIds: user.linkedSchoolIds,
            accessFlags: user.accessFlags,
            ...(password ? { password } : {}),
          });
          const savedUser = { ...user, id: result?.id || user.id, email: previousUser?.email || user.email };
          state.users = state.users.map((item) => (item.id === savedUser.id ? savedUser : item));
          state.modal = null;
          render();
          try {
            await supabase.refreshCloudData?.(false);
          } catch (refreshError) {
            console.error(refreshError);
          }
          showToast(password ? "تم تحديث المستخدم وتغيير كلمة المرور." : "تم تحديث المستخدم.");
          return;
        }

        if (!password) {
          showToast("كلمة المرور مطلوبة عند إنشاء مستخدم جديد.");
          return;
        }

        const result = await supabase.callFunction("manage-user", {
          name: user.name,
          email: user.email,
          password,
          role: user.role,
          schoolId: user.schoolId,
          active: user.active,
          linkedSchoolIds: user.linkedSchoolIds,
          accessFlags: user.accessFlags,
        });
        const savedUser = { ...user, id: result?.id || user.id };
        state.users = state.users.some((item) => item.id === savedUser.id) ? state.users.map((item) => (item.id === savedUser.id ? savedUser : item)) : [...state.users, savedUser];
        state.modal = null;
        render();
        try {
          await supabase.refreshCloudData?.(false);
        } catch (refreshError) {
          console.error(refreshError);
        }
        showToast("تم إنشاء المستخدم وربطه بخدمة المصادقة.");
        return;
      } catch (error) {
        console.error(error);
        showToast(formatCloudUserError(error, Boolean(id)));
        return;
      }
    }
    const localUser = { ...user, password: password || user.password || "Password123!" };
    state.users = state.users.some((item) => item.id === localUser.id) ? state.users.map((item) => (item.id === localUser.id ? localUser : item)) : [...state.users, localUser];
    await notifications.notifyRoleChange(localUser, previousUser);
    await audit.recordActivity(id ? "user_updated" : "user_created", id ? "تم تحديث مستخدم" : "تم إنشاء مستخدم", `${localUser.email} (${localUser.role})`, localUser.schoolId, state.currentUser.id);
    await audit.recordAudit(id ? "user_updated" : "user_created", "user", localUser.id, `${localUser.email} (${localUser.role})`, "medium", localUser.schoolId, state.currentUser.id);
    state.modal = null;
    persistLocal();
    showToast("تم حفظ المستخدم.");
  }

  async function deleteUser(id) {
    const { getUser, canEditUser, state, cloud, showToast, supabase, persistLocal, audit, render } = getContext();
    const user = getUser(id);
    if (!user || !canEditUser(user) || id === state.currentUser.id) return;
    const confirmed = confirm("هل تريد حذف هذا المستخدم نهائيًا؟ ستبقى المهام والسجلات التاريخية محفوظة دون ربطها بالحساب المحذوف، ولا يمكن استعادة الحساب إلا من نسخة احتياطية.");
    if (!confirmed) return;
    if (cloud.enabled) {
      try {
        await supabase.callFunction("manage-user", {
          id,
          action: "delete",
        });
        state.users = state.users.filter((item) => item.id !== id);
        state.tasks = state.tasks.map((task) => ({
          ...task,
          assigneeId: task.assigneeId === id ? "" : task.assigneeId,
          creatorId: task.creatorId === id ? "" : task.creatorId,
        }));
        state.pagination.usersPage = 1;
        render();
        try {
          await supabase.refreshCloudData?.(false);
        } catch (refreshError) {
          console.error(refreshError);
        }
        showToast("تم حذف المستخدم نهائيًا.");
      } catch (error) {
        console.error(error);
        showToast(formatCloudUserError(error, true));
      }
      return;
    }
    state.users = state.users.filter((item) => item.id !== id);
    state.tasks = state.tasks.map((task) => ({
      ...task,
      assigneeId: task.assigneeId === id ? "" : task.assigneeId,
      creatorId: task.creatorId === id ? "" : task.creatorId,
    }));
    await audit.recordActivity("user_deleted", "تم حذف مستخدم", `${user.email}`, user.schoolId, state.currentUser.id);
    await audit.recordAudit("user_deleted", "user", id, `تمت إزالة ${user.email} محليًا.`, "high", user.schoolId, state.currentUser.id);
    persistLocal();
    showToast("تم حذف المستخدم.");
  }

  async function saveSchool(event) {
    event.preventDefault();
    const { state, cloud, showToast, supabase, persistLocal, audit, render } = getContext();
    if (state.currentUser?.role !== "general_manager") {
      showToast("فقط مدير الإدارة العامة يمكنه إضافة فروع المدرسة.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const id = String(form.get("id") || "").trim();
    if (id === "11111111-1111-4111-8111-111111111111") {
      showToast("لا يمكن تعديل فرع الإدارة العامة.");
      return;
    }
    const school = normalizeSchool({
      id: id || createUuid(),
      name: form.get("name"),
      shortName: form.get("shortName"),
    });
    if (!school.name) {
      showToast("اكتب اسم الفرع أولًا.");
      return;
    }
    const duplicate = state.schools.some((item) => item.name.trim() === school.name && item.id !== school.id);
    if (duplicate) {
      showToast("يوجد فرع بنفس الاسم.");
      return;
    }
    try {
      if (cloud.enabled) {
        await supabase.saveCloudDoc("schools", school.id, school, false);
      }
      state.schools = state.schools.some((item) => item.id === school.id)
        ? state.schools.map((item) => (item.id === school.id ? school : item))
        : [...state.schools, school];
      state.schools = sortSchools(state.schools);
      try {
        await audit.recordActivity(id ? "school_updated" : "school_created", id ? "تم تحديث فرع مدرسة" : "تم إضافة فرع مدرسة", school.name, school.id, state.currentUser.id);
        await audit.recordAudit(id ? "school_updated" : "school_created", "school", school.id, school.name, "medium", school.id, state.currentUser.id);
      } catch (auditError) {
        console.warn("School audit log failed", auditError);
      }
      state.modal = null;
      persistLocal();
      showToast(id ? "تم تحديث الفرع." : "تم إضافة الفرع.");
      render();
    } catch (error) {
      console.error(error);
      showToast(error?.message || "تعذر حفظ الفرع.");
    }
  }

  async function deleteSchool(id) {
    const { state, cloud, showToast, supabase, persistLocal, render } = getContext();
    const school = state.schools.find((item) => item.id === id);
    if (state.currentUser?.role !== "general_manager" || !school) return;
    if (isGeneralSchoolId(id)) {
      showToast("لا يمكن حذف حساب الإدارة العامة.");
      return;
    }
    const usersCount = state.users.filter((user) => user.schoolId === id).length;
    const tasksCount = state.tasks.filter((task) => task.schoolId === id).length;
    if (usersCount || tasksCount) {
      showToast(`لا يمكن حذف هذا الفرع قبل نقل أو تعطيل الحسابات والمهام المرتبطة به. الحسابات: ${usersCount}، المهام: ${tasksCount}.`);
      return;
    }
    const confirmed = confirm(`هل تريد حذف فرع "${school.name}"؟`);
    if (!confirmed) return;
    try {
      if (cloud.enabled) {
        await supabase.deleteCloudDoc("schools", id);
      }
      state.schools = sortSchools(state.schools.filter((item) => item.id !== id));
      if (state.activeSchoolId === id) {
        state.activeSchoolId = "all";
      }
      state.modal = null;
      persistLocal();
      showToast("تم حذف الفرع.");
      render();
    } catch (error) {
      console.error(error);
      showToast("تعذر حذف الفرع. تأكد من عدم وجود أقسام أو سجلات مرتبطة به.");
    }
  }

  return {
    normalizeUser,
    normalizeSchool,
    ...view,
    saveMyProfile,
    saveUser,
    saveSchool,
    deleteSchool,
    disableUser: deleteUser,
    deleteUser,
  };
}
