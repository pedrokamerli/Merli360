export function parseModuleAccess(value?: string | null) {
  if (!value || value === "all") return ["all"];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.map(String)
      : String(value).split(",").map((item) => item.trim()).filter(Boolean);
  } catch {
    return String(value).split(",").map((item) => item.trim()).filter(Boolean);
  }
}

export function hasGrantedModule(value: string | null | undefined, module: string) {
  const modules = parseModuleAccess(value);
  return modules.includes("all") || modules.includes(module);
}
