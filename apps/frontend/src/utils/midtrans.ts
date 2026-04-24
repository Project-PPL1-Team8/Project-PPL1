export const loadMidtransScript = (clientKey: string): Promise<boolean> => {
  return new Promise((resolve) => {
    const midtransScriptUrl = 'https://app.sandbox.midtrans.com/snap/snap.js';
    
    let scriptTag = document.getElementById('midtrans-script');
    if (scriptTag) {
      resolve(true);
      return;
    }

    scriptTag = document.createElement('script');
    scriptTag.id = 'midtrans-script';
    scriptTag.src = midtransScriptUrl;
    scriptTag.setAttribute('data-client-key', clientKey);

    scriptTag.onload = () => {
      resolve(true);
    };

    scriptTag.onerror = () => {
      resolve(false);
    };

    document.body.appendChild(scriptTag);
  });
};
