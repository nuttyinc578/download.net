const button = document.querySelector('#launcher-download');
const agreement = document.querySelector('#license-check');
const releaseUrl = 'https://github.com/nuttyinc578/download.net/releases/download/v1.0/download.net-launcher-v1-folder.zip';

const updateDownload = () => { button.disabled = !agreement.checked; };
agreement.addEventListener('change', updateDownload);
button.addEventListener('click', () => {
  if (agreement.checked) location.href = releaseUrl;
});
updateDownload();
