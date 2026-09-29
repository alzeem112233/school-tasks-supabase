export type BackupStorageEntry = {
  bucket: string;
  path: string;
  backupPath: string;
  contentType: string;
};

function avatarStoragePath(avatarUrl: string) {
  const marker = "/storage/v1/object/public/profile-avatars/";
  const markerIndex = avatarUrl.indexOf(marker);
  if (markerIndex < 0) return "";
  try {
    return decodeURIComponent(avatarUrl.slice(markerIndex + marker.length).split("?")[0]);
  } catch {
    return "";
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String((error as { message?: string })?.message || error || "خطأ غير معروف");
}

export async function snapshotBackupFiles(
  adminClient: any,
  backupId: string,
  attachments: Array<{ file_path?: string; file_type?: string }>,
  profiles: Array<{ avatar_url?: string }>,
) {
  const candidates = [
    ...attachments
      .filter((item) => item.file_path)
      .map((item) => ({ bucket: "task-attachments", path: String(item.file_path), contentType: String(item.file_type || "application/octet-stream") })),
    ...profiles
      .map((item) => avatarStoragePath(String(item.avatar_url || "")))
      .filter(Boolean)
      .map((path) => ({ bucket: "profile-avatars", path, contentType: "" })),
  ];
  const unique = [...new Map(candidates.map((item) => [`${item.bucket}:${item.path}`, item])).values()];
  const storageFiles: BackupStorageEntry[] = [];
  const warnings: string[] = [];

  for (let index = 0; index < unique.length; index += 5) {
    const batch = unique.slice(index, index + 5);
    const results = await Promise.all(batch.map(async (item) => {
      const backupPath = `${backupId}/${item.bucket}/${item.path}`;
      const { error } = await adminClient.storage
        .from(item.bucket)
        .copy(item.path, backupPath, { destinationBucket: "site-backups" });
      if (error) return { item, error };
      return { item, backupPath };
    }));
    for (const result of results) {
      if ("error" in result) {
        warnings.push(`${result.item.bucket}/${result.item.path}: ${errorMessage(result.error)}`);
      } else {
        storageFiles.push({ ...result.item, backupPath: result.backupPath });
      }
    }
  }

  const { data: backup, error: readError } = await adminClient
    .from("backups")
    .select("backup_data, entity_counts")
    .eq("id", backupId)
    .single();
  if (readError || !backup) throw readError || new Error("تعذر قراءة النسخة الاحتياطية بعد إنشائها.");

  const backupData = {
    ...(backup.backup_data || {}),
    storageFiles,
    storageWarnings: warnings,
  };
  const entityCounts = {
    ...(backup.entity_counts || {}),
    storageFiles: storageFiles.length,
  };
  const { error: updateError } = await adminClient
    .from("backups")
    .update({ backup_data: backupData, entity_counts: entityCounts })
    .eq("id", backupId);
  if (updateError) throw updateError;

  return { storageFiles, warnings, entityCounts };
}

export async function restoreBackupFiles(adminClient: any, entries: BackupStorageEntry[] = []) {
  const restored: BackupStorageEntry[] = [];
  const warnings: string[] = [];
  for (let index = 0; index < entries.length; index += 3) {
    const batch = entries.slice(index, index + 3);
    const results = await Promise.all(batch.map(async (entry) => {
      try {
        if (!entry?.bucket || !entry?.path || !entry?.backupPath) throw new Error("بيانات ملف النسخة الاحتياطية غير مكتملة.");
        const { data: file, error: downloadError } = await adminClient.storage.from("site-backups").download(entry.backupPath);
        if (downloadError || !file) throw downloadError || new Error(`تعذر قراءة ${entry.backupPath}`);
        const { error: uploadError } = await adminClient.storage.from(entry.bucket).upload(entry.path, file, {
          upsert: true,
          contentType: entry.contentType || file.type || "application/octet-stream",
          cacheControl: "3600",
        });
        if (uploadError) throw uploadError;
        return { entry };
      } catch (error) {
        return { entry, error };
      }
    }));
    for (const result of results) {
      if ("error" in result) warnings.push(`${result.entry?.bucket || "storage"}/${result.entry?.path || "file"}: ${errorMessage(result.error)}`);
      else restored.push(result.entry);
    }
  }
  return { restored, warnings };
}
