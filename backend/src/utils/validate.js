function validatePackage(body, { partial = false } = {}) {
  const errors = [];
  const requiredFields = ['name', 'destination', 'price', 'duration_days'];

  if (!partial) {
    requiredFields.forEach((field) => {
      if (body[field] === undefined || body[field] === null || body[field] === '') {
        errors.push(`${field.replace('_', ' ')} is required`);
      }
    });
  }

  if (body.price !== undefined && Number(body.price) <= 0) {
    errors.push('price must be greater than 0');
  }

  if (body.duration_days !== undefined && Number(body.duration_days) <= 0) {
    errors.push('duration_days must be greater than 0');
  }

  return errors;
}

function validateBooking(body) {
  const errors = [];

  if (!body.package_id) errors.push('package_id is required');
  if (!body.traveler_name || !String(body.traveler_name).trim()) errors.push('traveler_name is required');

  if (!body.number_of_travelers || Number(body.number_of_travelers) <= 0) {
    errors.push('number_of_travelers must be at least 1');
  }

  if (!body.travel_date) {
    errors.push('travel_date is required');
  } else {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const travelDate = new Date(body.travel_date);
    if (isNaN(travelDate.getTime())) {
      errors.push('travel_date is not a valid date');
    } else if (travelDate < today) {
      errors.push('travel_date must be today or a future date');
    }
  }

  return errors;
}

module.exports = { validatePackage, validateBooking };
