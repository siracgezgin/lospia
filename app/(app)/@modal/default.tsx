// Parallel-route fallback for the @modal slot: renders nothing when no route is
// being intercepted (i.e. on every normal page and on a direct /tasks/[id] load).
export default function ModalDefault() {
  return null;
}
