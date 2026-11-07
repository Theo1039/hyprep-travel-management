
function validatePackage(body, { partial = false } = {}) {
  const errors = [];

  const requiredFields = [
    'name',
    'destination',
    'price',
    'duration_days'
  ];

  // Check required fields when creating a package.
  if (!partial) {
    requiredFields.forEach((field) => {
      const value = body[field];

      if (
        value === undefined ||
        value === null ||
        (typeof value === 'string' && !value.trim())
      ) {
        errors.push(`${field.replace('_', ' ')} is required`);
      }
    });
  }

  // Validate package name.
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      errors.push('name must be a valid text value');
    }
  }

  // Validate destination.
  if (body.destination !== undefined) {
    if (
      typeof body.destination !== 'string' ||
      !body.destination.trim()
    ) {
      errors.push('destination must be a valid text value');
    }
  }

  // Validate price.
  if (body.price !== undefined) {
    const price = Number(body.price);

    if (!Number.isFinite(price) || price <= 0) {
      errors.push('price must be a valid number greater than 0');
    }
  }

  // Validate duration.
  if (body.duration_days !== undefined) {
    const duration = Number(body.duration_days);

    if (
      !Number.isInteger(duration) ||
      duration <= 0
    ) {
      errors.push('duration_days must be a positive whole number');
    }
  }

  return errors;
}


function validateBooking(body) {
  const errors = [];

  // Check package ID.
  if (
    typeof body.package_id !== 'string' ||
    !body.package_id.trim()
  ) {
    errors.push('package_id is required');
  }

  // Check traveller name.
  if (
    typeof body.traveler_name !== 'string' ||
    !body.traveler_name.trim()
  ) {
    errors.push('traveler_name is required');
  }

  // Check number of travellers.
  const travelers = Number(body.number_of_travelers);

  if (
    !Number.isInteger(travelers) ||
    travelers < 1
  ) {
    errors.push('number_of_travelers must be a positive whole number');
  }

  // Check travel date.
  if (!body.travel_date) {
    errors.push('travel_date is required');
  } else {
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;

    if (!datePattern.test(body.travel_date)) {
      errors.push('travel_date must use YYYY-MM-DD format');
    } else {
      const [year, month, day] = body.travel_date.split('-').map(Number);

      const travelDate = new Date(
        Date.UTC(year, month - 1, day)
      );

      // Check whether the date actually exists.
      if (
        travelDate.getUTCFullYear() !== year ||
        travelDate.getUTCMonth() !== month - 1 ||
        travelDate.getUTCDate() !== day
      ) {
        errors.push('travel_date is not a valid date');
      } else {
        const today = new Date();

        const todayString = [
          today.getFullYear(),
          String(today.getMonth() + 1).padStart(2, '0'),
          String(today.getDate()).padStart(2, '0')
        ].join('-');

        if (body.travel_date < todayString) {
          errors.push('travel_date must be today or a future date');
        }
      }
    }
  }

  return errors;
}


module.exports = {
  validatePackage,
  validateBooking
};
