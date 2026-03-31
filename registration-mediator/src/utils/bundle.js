export function firstResourceFromBundle(bundle, resourceType) {
  if (!bundle || !Array.isArray(bundle.entry) || bundle.entry.length === 0) {
    return null;
  }

  const match = bundle.entry.find((entry) => {
    if (!entry?.resource) return false;
    if (!resourceType) return true;
    return entry.resource.resourceType === resourceType;
  });

  return match?.resource || null;
}
