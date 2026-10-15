import { useRef, useState } from 'react';
import { createPickupRequest } from '../services/databaseService';

const categories = ['Mobile', 'Laptop', 'Computer', 'Tablet', 'Printer', 'Battery', 'Accessories', 'Other'];
const conditions = ['Working', 'Damaged', 'Not Working'];

const emptyForm = {
  category: '',
  itemName: '',
  quantity: '1',
  approxWeightKg: '',
  condition: '',
  pickupAddress: '',
  city: '',
  pinCode: '',
  contactMobile: '',
  preferredDate: '',
  additionalNotes: '',
  offerPrice: '',
};

function getTodayDate() {
  const today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  return today.toISOString().slice(0, 10);
}

function validateForm(form) {
  const errors = {};
  const phoneDigits = form.contactMobile.replace(/\D/g, '');

  if (!form.category) errors.category = 'Choose an item category.';
  if (form.itemName.trim().length < 2) errors.itemName = 'Enter the item name.';
  if (!Number.isInteger(Number(form.quantity)) || Number(form.quantity) < 1) errors.quantity = 'Quantity must be a whole number of at least 1.';
  if (form.offerPrice.trim() === '' || !/^\d+(\.\d{1,2})?$/.test(form.offerPrice.trim()) || !Number.isFinite(Number(form.offerPrice)) || Number(form.offerPrice) < 0) errors.offerPrice = 'Enter your price offer in rupees, with up to two decimal places.';
  if (!Number.isFinite(Number(form.approxWeightKg)) || Number(form.approxWeightKg) <= 0) errors.approxWeightKg = 'Enter an approximate weight greater than 0 kg.';
  if (!form.condition) errors.condition = 'Choose the item condition.';
  if (form.pickupAddress.trim().length < 5) errors.pickupAddress = 'Enter the complete pickup address.';
  if (form.city.trim().length < 2) errors.city = 'Enter the pickup city.';
  if (!/^\d{4,10}$/.test(form.pinCode.trim())) errors.pinCode = 'Enter a valid PIN code using 4 to 10 digits.';
  if (phoneDigits.length < 7 || phoneDigits.length > 15) errors.contactMobile = 'Enter a valid mobile number with 7 to 15 digits.';
  if (!form.preferredDate || form.preferredDate < getTodayDate()) errors.preferredDate = 'Choose today or a future pickup date.';

  return errors;
}

function FormField({ id, label, error, className = '', children }) {
  return (
    <div className={`form-field booking-field${className ? ` ${className}` : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error && <span className="field-error" id={`${id}-error`}>{error}</span>}
    </div>
  );
}

function BookPickupPage({ user }) {
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [requestId, setRequestId] = useState('');
  const submissionInProgress = useRef(false);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: '' }));
    setSubmitError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!user?.uid || submissionInProgress.current) return;

    const validationErrors = validateForm(form);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    submissionInProgress.current = true;
    setIsSubmitting(true);
    setSubmitError('');
    setRequestId('');

    try {
      const newRequestId = await createPickupRequest({
        itemDetails: {
          category: form.category,
          name: form.itemName.trim(),
          quantity: Number(form.quantity),
          approxWeightKg: Number(form.approxWeightKg),
          condition: form.condition,
        },
        pickupDetails: {
          address: form.pickupAddress.trim(),
          city: form.city.trim(),
          pinCode: form.pinCode.trim(),
          contactMobile: form.contactMobile.trim(),
          preferredDate: form.preferredDate,
          additionalNotes: form.additionalNotes.trim(),
        },
        offerPrice: Number(form.offerPrice),
      });
      setForm(emptyForm);
      setErrors({});
      setRequestId(newRequestId);
    } catch (error) {
      setSubmitError(error.message === 'Failed to fetch'
        ? 'We couldn’t reach the pickup service. Check your connection and try again.'
        : error.message || 'We couldn’t save your pickup request. Please try again.');
    } finally {
      submissionInProgress.current = false;
      setIsSubmitting(false);
    }
  };

  if (!user?.uid) {
    return <main className="dashboard-shell container"><section className="placeholder-panel"><h1>Sign in required</h1><p>Sign in to book an e-waste pickup.</p><a className="button button-primary" href="/">Return to home</a></section></main>;
  }

  return (
    <main className="booking-shell container">
      <div className="booking-heading">
        <div><span className="dashboard-kicker">Pickup request</span><h1>Book an e-waste pickup</h1><p>Share a few details about your items and where we should collect them.</p></div>
        <a className="button button-light" href="/dashboard">Back to dashboard</a>
      </div>

      {requestId && <section className="booking-success" role="status"><span className="booking-success-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span><div><h2>Pickup request received</h2><p>Your request ID is <strong>{requestId}</strong>. Keep it for your records.</p><a className="text-link" href="/dashboard">View your dashboard <span aria-hidden="true">→</span></a></div></section>}
      {submitError && <p className="booking-error" role="alert">{submitError}</p>}

      <form className="booking-form" onSubmit={handleSubmit} noValidate>
        <section className="booking-form-section">
          <div className="booking-section-heading"><span>01</span><div><h2>Items and your price offer</h2><p>Tell us what you would like to recycle and the price you are requesting.</p></div></div>
          <div className="booking-fields-grid">
            <FormField id="booking-category" label="Item category" error={errors.category}>
              <select id="booking-category" name="category" value={form.category} onChange={updateField} aria-invalid={Boolean(errors.category)} aria-describedby={errors.category ? 'booking-category-error' : undefined} required><option value="">Select a category</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select>
            </FormField>
            <FormField id="booking-item-name" label="Item name" error={errors.itemName}>
              <input id="booking-item-name" name="itemName" value={form.itemName} onChange={updateField} placeholder="e.g. 24-inch monitor" maxLength="100" aria-invalid={Boolean(errors.itemName)} aria-describedby={errors.itemName ? 'booking-item-name-error' : undefined} required />
            </FormField>
            <FormField id="booking-quantity" label="Quantity" error={errors.quantity}>
              <input id="booking-quantity" name="quantity" type="number" inputMode="numeric" min="1" step="1" value={form.quantity} onChange={updateField} aria-invalid={Boolean(errors.quantity)} aria-describedby={errors.quantity ? 'booking-quantity-error' : undefined} required />
            </FormField>
            <FormField id="booking-weight" label="Approximate weight (kg)" error={errors.approxWeightKg}>
              <input id="booking-weight" name="approxWeightKg" type="number" inputMode="decimal" min="0.1" step="0.1" value={form.approxWeightKg} onChange={updateField} placeholder="e.g. 2.5" aria-invalid={Boolean(errors.approxWeightKg)} aria-describedby={errors.approxWeightKg ? 'booking-weight-error' : undefined} required />
            </FormField>
            <FormField id="booking-condition" label="Item condition" error={errors.condition}>
              <select id="booking-condition" name="condition" value={form.condition} onChange={updateField} aria-invalid={Boolean(errors.condition)} aria-describedby={errors.condition ? 'booking-condition-error' : undefined} required><option value="">Select condition</option>{conditions.map((condition) => <option key={condition} value={condition}>{condition}</option>)}</select>
            </FormField>
            <FormField id="booking-offer-price" label="Your price offer (₹)" error={errors.offerPrice}>
              <input id="booking-offer-price" name="offerPrice" type="number" inputMode="decimal" min="0" step="0.01" value={form.offerPrice} onChange={updateField} placeholder="Enter your expected price" aria-invalid={Boolean(errors.offerPrice)} aria-describedby={errors.offerPrice ? 'booking-offer-price-error' : undefined} required />
            </FormField>
          </div>
        </section>

        <section className="booking-form-section">
          <div className="booking-section-heading"><span>02</span><div><h2>Pickup details</h2><p>Choose where and when we can collect the items.</p></div></div>
          <div className="booking-fields-grid">
            <FormField id="booking-address" label="Pickup address" error={errors.pickupAddress} className="full-width">
              <textarea id="booking-address" name="pickupAddress" value={form.pickupAddress} onChange={updateField} placeholder="Building, street, area" maxLength="240" aria-invalid={Boolean(errors.pickupAddress)} aria-describedby={errors.pickupAddress ? 'booking-address-error' : undefined} required />
            </FormField>
            <FormField id="booking-city" label="City" error={errors.city}>
              <input id="booking-city" name="city" value={form.city} onChange={updateField} autoComplete="address-level2" maxLength="80" aria-invalid={Boolean(errors.city)} aria-describedby={errors.city ? 'booking-city-error' : undefined} required />
            </FormField>
            <FormField id="booking-pin" label="PIN code" error={errors.pinCode}>
              <input id="booking-pin" name="pinCode" inputMode="numeric" autoComplete="postal-code" value={form.pinCode} onChange={updateField} maxLength="10" aria-invalid={Boolean(errors.pinCode)} aria-describedby={errors.pinCode ? 'booking-pin-error' : undefined} required />
            </FormField>
            <FormField id="booking-mobile" label="Contact mobile number" error={errors.contactMobile}>
              <input id="booking-mobile" name="contactMobile" type="tel" inputMode="tel" autoComplete="tel" value={form.contactMobile} onChange={updateField} placeholder="Include country code if needed" maxLength="20" aria-invalid={Boolean(errors.contactMobile)} aria-describedby={errors.contactMobile ? 'booking-mobile-error' : undefined} required />
            </FormField>
            <FormField id="booking-date" label="Preferred pickup date" error={errors.preferredDate}>
              <input id="booking-date" name="preferredDate" type="date" min={getTodayDate()} value={form.preferredDate} onChange={updateField} aria-invalid={Boolean(errors.preferredDate)} aria-describedby={errors.preferredDate ? 'booking-date-error' : undefined} required />
            </FormField>
            <FormField id="booking-notes" label="Additional notes (optional)" className="full-width">
              <textarea id="booking-notes" name="additionalNotes" value={form.additionalNotes} onChange={updateField} placeholder="Access instructions or anything else we should know" maxLength="500" />
            </FormField>
          </div>
        </section>

        <div className="booking-submit-row"><p>Your price offer will be sent to the admin for review. You can submit a new offer if the request is rejected.</p><button className="button button-primary" type="submit" disabled={isSubmitting}>{isSubmitting && <span className="loading-spinner" aria-hidden="true" />}{isSubmitting ? 'Saving request...' : 'Submit pickup request'}<svg className="button-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></button></div>
      </form>
    </main>
  );
}

export default BookPickupPage;