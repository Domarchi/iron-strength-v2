const BUILD_ID = process.env.NEXT_PUBLIC_OFFLINE_BUILD_ID;
function checkWorker(worker: ServiceWorker, prepare = false): Promise<boolean> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(
      () => {
        channel.port1.close();
        resolve(false);
      },
      prepare ? 45000 : 10000,
    );
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(event.data?.ready === true && event.data?.buildId === BUILD_ID);
    };
    worker.postMessage({ type: prepare ? "OFFLINE_PREPARE" : "OFFLINE_READY" }, [channel.port2]);
  });
}
export async function isOfflineInterfaceReady(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;
  const registration = await navigator.serviceWorker.getRegistration("/");
  return registration?.active ? checkWorker(registration.active) : false;
}
export async function prepareOfflineInterface(): Promise<void> {
  if (process.env.NODE_ENV === "development")
    throw new Error("La apertura sin conexión requiere la versión preparada de la app.");
  if (!("serviceWorker" in navigator) || !window.isSecureContext)
    throw new Error(
      "Este navegador no permite preparar la app sin conexión. Ábrela mediante HTTPS en un navegador compatible.",
    );
  const registration = await navigator.serviceWorker.register(`/offline-workers/${BUILD_ID}.js`, {
    scope: "/",
    updateViaCache: "none",
  });
  const worker = registration.installing ?? registration.waiting ?? registration.active;
  if (!worker) throw new Error("No se pudo preparar la app sin conexión. Reintenta.");
  if (worker.state !== "activated" && worker !== registration.waiting)
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        worker.removeEventListener("statechange", change);
        reject(new Error("La preparación tardó demasiado. Comprueba tu conexión y reintenta."));
      }, 45000);
      function change() {
        if (worker!.state === "activated") {
          clearTimeout(timer);
          worker!.removeEventListener("statechange", change);
          resolve();
        } else if (
          worker!.state === "redundant" ||
          (worker!.state === "installed" &&
            registration.active !== null &&
            registration.active !== worker)
        ) {
          clearTimeout(timer);
          worker!.removeEventListener("statechange", change);
          reject(
            new Error(
              "No se pudo activar la interfaz descargada. Conservamos tus datos; cierra las otras pestañas y reintenta.",
            ),
          );
        }
      }
      worker.addEventListener("statechange", change);
      change();
    });
  if (!registration.active || !(await checkWorker(registration.active, true)))
    throw new Error(
      "Faltan recursos de la app. Comprueba la conexión, cierra las otras pestañas y vuelve a descargar.",
    );
}
