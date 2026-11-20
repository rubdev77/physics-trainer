export function spring(value, stiffness, damping) {
  return {value, target:value, velocity:0, stiffness, damping};
}

export function step(spring, dt) {
  spring.velocity += (-spring.stiffness * (spring.value - spring.target) - spring.damping * spring.velocity) * dt;
  spring.value += spring.velocity * dt;
}

export function settle(spring) {
  spring.value = spring.target;
  spring.velocity = 0;
}

export function stillMoving(spring) {
  return Math.abs(spring.value - spring.target) > .05 || Math.abs(spring.velocity) > .05;
}

export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
