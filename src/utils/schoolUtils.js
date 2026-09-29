export const GENERAL_SCHOOL_ID = "11111111-1111-4111-8111-111111111111";
export const GENERAL_SCHOOL_NAME = "الإدارة العامة";

export function isGeneralSchoolId(schoolId) {
  return schoolId === GENERAL_SCHOOL_ID;
}

export function schoolOrderValue(school) {
  if (isGeneralSchoolId(school?.id)) return "0";
  return `1:${String(school?.name || "")}`;
}

export function sortSchools(schools = []) {
  return [...schools].sort((a, b) => schoolOrderValue(a).localeCompare(schoolOrderValue(b), "ar"));
}
