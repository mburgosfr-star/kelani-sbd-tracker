export function mergeAccessoryPrsFromWorkout(currentAccessoryPRs = {}, workout = {}) {
  let nextAccessoryPRs = currentAccessoryPRs;

  (Array.isArray(workout?.accessories) ? workout.accessories : []).forEach(accessory => {
    const name = accessory?.key || accessory?.name;
    const bestWeight = Math.max(
      0,
      ...(Array.isArray(accessory?.weights) ? accessory.weights : [])
        .map(weight => Number(weight) || 0)
    );

    if (!name || bestWeight <= (Number(nextAccessoryPRs?.[name]) || 0)) return;

    if (nextAccessoryPRs === currentAccessoryPRs) {
      nextAccessoryPRs = { ...currentAccessoryPRs };
    }
    nextAccessoryPRs[name] = bestWeight;
  });

  return nextAccessoryPRs;
}

export function matchesCompletedSmartGeneration(marker, state) {
  return Boolean(
    marker &&
    marker.history === state?.history &&
    marker.prs === state?.prs &&
    marker.oneRMs === state?.oneRMs &&
    marker.accessoryPRs === state?.accessoryPRs &&
    Number(marker.currentIndex) === Number(state?.currentIndex) &&
    Number(marker.currentCycle) === Number(state?.currentCycle)
  );
}
