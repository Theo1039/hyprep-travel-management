// Upload package images (admin only).
async function uploadPackageImage(file, session) {
  const formData = new FormData();

  formData.append('file', file);

  return apiFetch('/upload/package-image', session, {
    method: 'POST',
    body: formData
  });
}


// Upload payment proof (private upload).
async function uploadPaymentProof(file, session) {
  const formData = new FormData();

  formData.append('file', file);

  return apiFetch('/upload/payment-proof', session, {
    method: 'POST',
    body: formData
  });
}