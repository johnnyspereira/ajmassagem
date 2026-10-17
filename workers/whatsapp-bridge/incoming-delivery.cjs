/** A new LID may need time to resolve; never silently lose that first message. */
function createIncomingDelivery({
  persist,
  isMedia,
  getId,
  onError,
  wait = (ms) =>
    new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      timer.unref?.();
    }),
}) {
  const pending = new Map();
  return function deliver(message) {
    const id = getId(message);
    if (!id || message?.fromMe) return Promise.resolve();
    if (pending.has(id)) return pending.get(id);
    const task = (async () => {
      let lastError;
      for (const delay of [0, 2000, 5000, 15000, 45000]) {
        if (delay) await wait(delay);
        try {
          const result = await persist(message);
          if (result && (!isMedia(message) || result.mediaSaved)) return;
        } catch (error) {
          lastError = error;
        }
      }
      onError(
        lastError ||
          new Error(
            'Não foi possível resolver ou guardar a mensagem recebida após várias tentativas.'
          )
      );
    })().finally(() => pending.delete(id));
    pending.set(id, task);
    return task;
  };
}
module.exports = { createIncomingDelivery };
