import { useEffect, useState } from 'react';
import { deleteCustomerPickupRequest, submitDeliveryOption, submitPickupOffer, subscribeToPickupData } from '../services/databaseService';

const deliveryOptions = [
  ['self_dropoff', 'I will deliver the item'],
  ['arranged_pickup', 'Please arrange pickup'],
];

function getRequestCounts(requestData) {
  const requests = requestData && typeof requestData === 'object'
    ? Object.entries(requestData)
      .filter(([, request]) => request && typeof request === 'object')
      .map(([key, request]) => ({ ...request, requestId: request.requestId || key }))
    : [];

  return {
    requests,
    total: requests.length,
    pending: requests.filter((request) => String(request.status || '').toLowerCase() === 'pending').length,
    completed: requests.filter((request) => String(request.status || '').toLowerCase() === 'completed').length,
    collectedAmount: requests.reduce((totalAmount, request) => {
      if (String(request.status || '').toLowerCase() !== 'completed') return totalAmount;
      const price = Number(request.price);
      return Number.isFinite(price) && price >= 0 ? totalAmount + price : totalAmount;
    }, 0),
  };
}

function formatPrice(price) {
  const amount = Number(price);
  return Number.isFinite(amount) && amount >= 0
    ? `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
    : '—';
}

function formatTrackingDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
}

function getDeliveryOptionLabel(option) {
  return deliveryOptions.find(([value]) => value === option)?.[1] || '';
}

function getTrackingSteps(request) {
  const status = String(request.status || 'pending').toLowerCase();
  const isApproved = status === 'approved' || status === 'completed';
  const isCompleted = status === 'completed';
  const deliveryLabel = getDeliveryOptionLabel(request.deliveryOption);
  const deliveryAccepted = ['accepted', 'confirmed', 'scheduled'].includes(request.deliveryStatus);
  const dateSet = request.deliveryStatus === 'scheduled' && request.collectionDate;

  return [
    {
      title: 'Request submitted',
      detail: formatTrackingDate(request.createdAt) ? `Submitted ${formatTrackingDate(request.createdAt)}` : 'Your pickup request was received.',
      state: 'complete',
    },
    {
      title: 'Admin review',
      detail: status === 'rejected'
        ? `Price offer rejected${request.rejectionNote ? `: ${request.rejectionNote}` : '.'}`
        : status === 'pending'
          ? 'Waiting for the admin to accept or reject your price offer.'
          : `Price offer accepted${request.price === undefined ? '.' : ` at ${formatPrice(request.price)}.`}`,
      state: status === 'rejected' ? 'rejected' : status === 'pending' ? 'current' : 'complete',
    },
    {
      title: 'Delivery choice',
      detail: !isApproved
        ? 'Available after the admin accepts your price.'
        : !request.deliveryOption
          ? 'Choose whether you will deliver the item or need an arranged pickup.'
          : deliveryAccepted
            ? `Admin accepted: ${deliveryLabel}.`
            : `Selected: ${deliveryLabel}. Waiting for admin acceptance.`,
      state: !isApproved ? 'waiting' : deliveryAccepted ? 'complete' : 'current',
    },
    {
      title: request.deliveryOption === 'self_dropoff' ? 'Delivery deadline' : 'Pickup date',
      detail: dateSet
        ? `${request.deliveryOption === 'self_dropoff' ? 'Deliver by' : 'Admin will collect on'} ${request.collectionDate}.`
        : deliveryAccepted
          ? 'Waiting for the admin to set a date.'
          : 'Available after the admin accepts your delivery choice.',
      state: dateSet ? 'complete' : deliveryAccepted ? 'current' : 'waiting',
    },
    {
      title: 'Delivered',
      detail: isCompleted ? 'The admin marked your e-waste product as collected.' : 'This will update after the admin collects your product.',
      state: isCompleted ? 'complete' : dateSet ? 'current' : 'waiting',
    },
  ];
}

function PickupTrackingTimeline({ request }) {
  return (
    <ol className="pickup-tracking-timeline" aria-label={`Progress for pickup request ${request.requestId}`}>
      {getTrackingSteps(request).map((step, index) => (
        <li className={`tracking-step tracking-step-${step.state}`} key={step.title}>
          <span className="tracking-step-marker" aria-hidden="true">{step.state === 'complete' ? '✓' : step.state === 'rejected' ? '!' : index + 1}</span>
          <div><strong>{step.title}</strong><p>{step.detail}</p></div>
        </li>
      ))}
    </ol>
  );
}

function PickupTrackingCards({ requests }) {
  const sortedRequests = requests.slice()
    .sort((first, second) => Number(second.updatedAt || second.createdAt || 0) - Number(first.updatedAt || first.createdAt || 0));

  return (
    <div className="pickup-tracking-cards">
      {sortedRequests.map((request) => (
        <article className="pickup-tracking-card" key={request.requestId}>
          <div className="pickup-tracking-card-heading">
            <div>
              <span className="dashboard-kicker">Request progress</span>
              <h3>{request.itemDetails?.name || request.itemDetails?.category || 'E-waste pickup'}</h3>
              <code>{request.requestId}</code>
            </div>
            <a className="text-link" href={`/track-request?requestId=${encodeURIComponent(request.requestId)}`}>Track details <span aria-hidden="true">→</span></a>
          </div>
          <PickupTrackingTimeline request={request} />
        </article>
      ))}
    </div>
  );
}

function PickupRequestsTable({ requests, preferences, onPreferenceChange, savingPreference, offerValues, onOfferValueChange, onOfferSubmit, savingOffer, onDeleteRequest, deletingRequest }) {
  const sortedRequests = requests.slice()
    .sort((first, second) => Number(second.createdAt || 0) - Number(first.createdAt || 0));

  return (
    <div className="admin-table-wrap">
      <table className="admin-table dashboard-products-table">
        <caption className="sr-only">Your submitted e-waste products, pickup status, price, and delivery choice</caption>
        <thead><tr><th>Product</th><th>Quantity</th><th>Pickup address</th><th>Status</th><th>Your offer / accepted price</th><th>Delivery option</th><th>Request ID</th><th>Actions</th></tr></thead>
        <tbody>{sortedRequests.map((request) => {
          const status = String(request.status || 'pending').toLowerCase();
          const approved = status === 'approved';
          const canSubmitOffer = status === 'pending' || status === 'rejected';
          const preference = request.deliveryOption || preferences[request.requestId] || '';
          const savedPreference = deliveryOptions.find(([value]) => value === preference)?.[1];
          return <tr key={request.requestId}>
            <td><strong>{request.itemDetails?.name || request.itemDetails?.category || 'E-waste item'}</strong><span>{request.itemDetails?.category || 'Category not set'}{request.itemDetails?.condition ? ` · ${request.itemDetails.condition}` : ''}</span></td>
            <td>{request.itemDetails?.quantity || 1}</td>
            <td>{request.pickupDetails?.address || '—'}<span>{[request.pickupDetails?.city, request.pickupDetails?.pinCode].filter(Boolean).join(', ')}</span></td>
            <td><span className={`admin-status status-${status}`}>{status === 'completed' ? 'Delivered' : request.status || 'Pending'}</span>{status === 'rejected' && request.rejectionNote && <span className="customer-rejection-note">Admin note: {request.rejectionNote}</span>}</td>
            <td>{approved
              ? <strong>{request.price === undefined ? 'Accepted' : formatPrice(request.price)}</strong>
              : canSubmitOffer
                ? <div className="customer-price-cell">
                  <form className="customer-offer-form" onSubmit={(event) => { event.preventDefault(); onOfferSubmit(request); }}>
                    <label className="sr-only" htmlFor={`customer-offer-${request.requestId}`}>{status === 'rejected' ? 'New price offer' : 'Your price offer'} for request {request.requestId}</label>
                    <input id={`customer-offer-${request.requestId}`} type="number" inputMode="decimal" min="0" step="0.01" required value={offerValues[request.requestId] ?? (request.offerPrice === undefined ? '' : String(request.offerPrice))} onChange={(event) => onOfferValueChange(request.requestId, event.target.value)} disabled={Boolean(savingOffer)} aria-label={`${status === 'rejected' ? 'New price offer' : 'Your price offer'} for request ${request.requestId}`} placeholder="Your price (₹)" />
                    <button className="table-action approve-action" type="submit" disabled={Boolean(savingOffer)}>{savingOffer === request.requestId ? 'Sending…' : status === 'rejected' ? 'Reapply with price' : request.offerPrice === undefined ? 'Submit price' : 'Update offer'}</button>
                  </form>
                  {request.offerPrice !== undefined && <span>Your current offer: {formatPrice(request.offerPrice)}</span>}
                </div>
                : <span>{request.price === undefined ? '—' : formatPrice(request.price)}</span>}</td>
            <td>{approved
              ? <div className="approved-delivery-choice">
                <strong>Request accepted{request.price === undefined ? '' : ` at ${formatPrice(request.price)}`}</strong>
                <label className="delivery-choice-control">
                  <span>Choose how you will deliver the items</span>
                  <select value={preference} onChange={(event) => onPreferenceChange(request.requestId, event.target.value)} disabled={Boolean(savingPreference) || ['accepted', 'confirmed', 'scheduled'].includes(request.deliveryStatus)}>
                    <option value="" disabled>Choose an option</option>
                    {deliveryOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                  </select>
                  {savingPreference === request.requestId && <span role="status">Saving…</span>}
                  {request.deliveryStatus === 'scheduled'
                    ? <span role="status">{preference === 'self_dropoff' ? `Please deliver your items by ${request.collectionDate}` : `Admin will collect on ${request.collectionDate}`}</span>
                    : ['accepted', 'confirmed'].includes(request.deliveryStatus)
                      ? <span role="status">Admin accepted your delivery choice. Waiting for the date.</span>
                      : savedPreference && <span role="status">Selected: {savedPreference}. Waiting for admin acceptance.</span>}
                </label>
              </div>
              : <span>{status === 'pending' || status === 'rejected' ? 'Available after approval' : savedPreference || '—'}</span>}</td>
            <td><a href={`/track-request?requestId=${encodeURIComponent(request.requestId)}`}><code>{request.requestId}</code></a></td>
            <td><button className="table-action reject-action" type="button" disabled={Boolean(deletingRequest)} onClick={() => onDeleteRequest(request)}>{deletingRequest === request.requestId ? 'Deleting…' : 'Delete request'}</button></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  );
}

function DashboardPage({ user, path }) {
  const [counts, setCounts] = useState({ requests: [], total: 0, pending: 0, completed: 0 });
  const [preferences, setPreferences] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [preferenceError, setPreferenceError] = useState('');
  const [savingPreference, setSavingPreference] = useState('');
  const [offerError, setOfferError] = useState('');
  const [offerMessage, setOfferMessage] = useState('');
  const [offerValues, setOfferValues] = useState({});
  const [savingOffer, setSavingOffer] = useState('');
  const [deletingRequest, setDeletingRequest] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleteMessage, setDeleteMessage] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const initialTrackingId = new URLSearchParams(window.location.search).get('requestId') || '';
  const [trackingInput, setTrackingInput] = useState(initialTrackingId);
  const [trackingSearch, setTrackingSearch] = useState(initialTrackingId);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    const unsubscribe = subscribeToPickupData(
      user.uid,
      ({ requests, preferences: nextPreferences }) => {
        if (!active) return;
        setCounts(getRequestCounts(requests));
        setPreferences(nextPreferences || {});
        setLoading(false);
      },
      () => {
        if (active) {
          setError('We couldn’t load your pickup requests. Check your connection and database rules, then try again.');
          setLoading(false);
        }
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [retryKey, user.uid]);

  const handlePreferenceChange = async (requestId, preference) => {
    setSavingPreference(requestId);
    setPreferenceError('');
    try {
      await submitDeliveryOption(requestId, preference);
      setPreferences((current) => ({ ...current, [requestId]: preference }));
      setCounts((current) => ({
        ...current,
        requests: current.requests.map((request) => request.requestId === requestId
          ? { ...request, deliveryOption: preference, deliveryStatus: 'awaiting_admin', collectionDate: null }
          : request),
      }));
    } catch (error) {
      setPreferenceError(error.message || 'We couldn’t send your delivery choice to the admin. Check your connection and try again.');
    } finally {
      setSavingPreference('');
    }
  };

  const handleOfferSubmit = async (request) => {
    const enteredPrice = offerValues[request.requestId] ?? (request.offerPrice === undefined ? '' : String(request.offerPrice));
    if (!/^\d+(\.\d{1,2})?$/.test(enteredPrice.trim())) {
      setOfferError('Enter a valid price offer in rupees, with up to two decimal places.');
      return;
    }

    const price = Number(enteredPrice);
    setSavingOffer(request.requestId);
    setOfferError('');
    setOfferMessage('');
    try {
      const result = await submitPickupOffer(request, price);
      const savedRequestId = result.requestId || request.requestId;
      setCounts((current) => ({
        ...current,
        requests: current.requests.map((item) => item.requestId === request.requestId
          ? { ...item, requestId: savedRequestId, offerPrice: price, status: 'Pending', rejectionNote: null }
          : item),
      }));
      setOfferValues((current) => {
        const next = { ...current, [savedRequestId]: String(price) };
        if (savedRequestId !== request.requestId) delete next[request.requestId];
        return next;
      });
      setOfferMessage(result.replacedRequestId
        ? `Your older request was restored as ${savedRequestId}. The ${formatPrice(price)} offer was sent to the admin for review.`
        : `Your ${formatPrice(price)} offer was sent to the admin for review.`);
    } catch (error) {
      setOfferError(error.message || 'Your price could not be submitted. Check your connection and try again.');
    } finally {
      setSavingOffer('');
    }
  };

  const handleDeleteRequest = async (request) => {
    const itemName = request.itemDetails?.name || request.itemDetails?.category || 'this pickup request';
    if (deletingRequest || !window.confirm(`Delete ${itemName} and its pickup history? This cannot be undone.`)) return;
    setDeletingRequest(request.requestId);
    setDeleteError('');
    setDeleteMessage('');
    try {
      await deleteCustomerPickupRequest(request.requestId);
      setCounts((current) => getRequestCounts(Object.fromEntries(
        current.requests.filter((item) => item.requestId !== request.requestId).map((item) => [item.requestId, item]),
      )));
      setPreferences((current) => {
        const next = { ...current };
        delete next[request.requestId];
        return next;
      });
      setDeleteMessage('Pickup request and its related data were deleted.');
    } catch (error) {
      setDeleteError(error.message || 'Couldn’t delete the pickup request. Please try again.');
    } finally {
      setDeletingRequest('');
    }
  };

  const offerTableProps = {
    offerValues,
    onOfferValueChange: (requestId, value) => setOfferValues((current) => ({ ...current, [requestId]: value })),
    onOfferSubmit: handleOfferSubmit,
    savingOffer,
    onDeleteRequest: handleDeleteRequest,
    deletingRequest,
  };

  if (path === '/track-request') {
    const trackedRequest = trackingSearch
      ? counts.requests.find((request) => request.requestId.toLowerCase() === trackingSearch.trim().toLowerCase())
      : null;

    return (
      <main className="dashboard-shell container">
        <div className="dashboard-heading">
          <div><span className="dashboard-kicker">Your account</span><h1>Track a Pickup Request</h1><p>Enter a request ID to see its latest progress. You can find the ID in My Pickup History.</p></div>
          <a className="button button-light" href="/history">My Pickup History</a>
        </div>
        <form className="track-request-form" onSubmit={(event) => { event.preventDefault(); setTrackingSearch(trackingInput.trim()); }}>
          <label htmlFor="tracking-request-id">Pickup request ID</label>
          <div><input id="tracking-request-id" value={trackingInput} onChange={(event) => setTrackingInput(event.target.value)} placeholder="Paste your request ID" required /><button className="button button-primary" type="submit">Track request</button></div>
        </form>
        {loading && <p className="dashboard-feedback" role="status"><span className="loading-spinner" aria-hidden="true" />Loading your requests...</p>}
        {error && <div className="dashboard-error" role="alert"><p>{error}</p><button className="button button-light" type="button" onClick={() => setRetryKey((key) => key + 1)}>Try again</button></div>}
        {!loading && !error && trackingSearch && !trackedRequest && <p className="dashboard-error" role="alert">No pickup request with that ID was found in your account. Check the ID in My Pickup History and try again.</p>}
        {!loading && !error && trackedRequest && <article className="pickup-tracking-card pickup-tracking-detail">
          <div className="pickup-tracking-card-heading">
            <div><span className="dashboard-kicker">Live request status</span><h2>{trackedRequest.itemDetails?.name || trackedRequest.itemDetails?.category || 'E-waste pickup'}</h2><code>{trackedRequest.requestId}</code></div>
            <span className={`admin-status status-${String(trackedRequest.status || 'pending').toLowerCase()}`}>{String(trackedRequest.status || '').toLowerCase() === 'completed' ? 'Delivered' : trackedRequest.status || 'Pending'}</span>
          </div>
          <p className="tracking-request-meta">{trackedRequest.itemDetails?.category || 'E-waste'} · Qty {trackedRequest.itemDetails?.quantity || 1} · {trackedRequest.pickupDetails?.address || 'Pickup address not set'}</p>
          <PickupTrackingTimeline request={trackedRequest} />
        </article>}
      </main>
    );
  }

  if (path === '/history') {
    return (
      <main className="dashboard-shell container">
        <div className="dashboard-heading">
          <div><span className="dashboard-kicker">Your account</span><h1>My Pickup History</h1><p>All your pickup requests and their latest status.</p></div>
          <a className="button button-primary" href="/book-pickup">Book a Pickup</a>
        </div>
        {loading && <p className="dashboard-feedback" role="status"><span className="loading-spinner" aria-hidden="true" />Loading your pickup history...</p>}
        {error && <div className="dashboard-error" role="alert"><p>{error}</p><button className="button button-light" type="button" onClick={() => setRetryKey((key) => key + 1)}>Try again</button></div>}
        {preferenceError && <p className="dashboard-error" role="alert">{preferenceError}</p>}
        {offerError && <p className="dashboard-error" role="alert">{offerError}</p>}
        {offerMessage && <p className="dashboard-success" role="status">{offerMessage}</p>}
        {deleteError && <p className="dashboard-error" role="alert">{deleteError}</p>}
        {deleteMessage && <p className="dashboard-success" role="status">{deleteMessage}</p>}
        {!loading && !error && counts.total === 0 && <section className="dashboard-empty"><span className="dashboard-kicker">A fresh start</span><h2>No pickup history yet</h2><p>Your pickup requests and their progress will appear here.</p><a href="/book-pickup" className="text-link">Book your first pickup <span aria-hidden="true">→</span></a></section>}
        {!loading && !error && counts.total > 0 && <section className="dashboard-my-products">
          <PickupRequestsTable requests={counts.requests} preferences={preferences} onPreferenceChange={handlePreferenceChange} savingPreference={savingPreference} {...offerTableProps} />
        </section>}
      </main>
    );
  }

  return (
    <main className="dashboard-shell container">
      <div className="dashboard-heading">
        <div><span className="dashboard-kicker">Your account</span><h1>Your Dashboard</h1><p>Welcome back{user.email ? `, ${user.email}` : ''}. Here’s your recycling activity.</p></div>
        <a className="button button-primary" href="/book-pickup">Book a Pickup</a>
      </div>

      {loading && <p className="dashboard-feedback" role="status"><span className="loading-spinner" aria-hidden="true" />Loading your pickup activity...</p>}
      {error && <div className="dashboard-error" role="alert"><p>{error}</p><button className="button button-light" type="button" onClick={() => setRetryKey((key) => key + 1)}>Try again</button></div>}
      {offerError && <p className="dashboard-error" role="alert">{offerError}</p>}
      {offerMessage && <p className="dashboard-success" role="status">{offerMessage}</p>}
      {preferenceError && <p className="dashboard-error" role="alert">{preferenceError}</p>}
      {deleteError && <p className="dashboard-error" role="alert">{deleteError}</p>}
      {deleteMessage && <p className="dashboard-success" role="status">{deleteMessage}</p>}

      <section className="dashboard-stats" aria-label="Pickup request summary">
        <article className="dashboard-stat"><span className="stat-symbol">01</span><span className="stat-label">Total pickup requests</span><strong>{loading ? '—' : counts.total}</strong><span className="stat-footnote">Across your account</span></article>
        <article className="dashboard-stat"><span className="stat-symbol pending-symbol">02</span><span className="stat-label">Pending requests</span><strong>{loading ? '—' : counts.pending}</strong><span className="stat-footnote">Awaiting completion</span></article>
        <article className="dashboard-stat"><span className="stat-symbol complete-symbol">03</span><span className="stat-label">Delivered pickups</span><strong>{loading ? '—' : counts.completed}</strong><span className="stat-footnote">Responsibly recycled</span></article>
        <article className="dashboard-stat"><span className="stat-symbol sales-symbol">₹</span><span className="stat-label">Total sales value</span><strong>{loading ? '—' : formatPrice(counts.collectedAmount)}</strong><span className="stat-footnote">From collected products</span></article>
      </section>

      {!loading && !error && counts.total === 0 && <section className="dashboard-empty"><span className="dashboard-kicker">A fresh start</span><h2>No pickup requests yet</h2><p>When you book a pickup, its progress will show up here.</p><a href="/book-pickup" className="text-link">Explore pickup options <span aria-hidden="true">→</span></a></section>}
      {!loading && !error && counts.total > 0 && <section className="dashboard-my-products">
        <div className="dashboard-my-products-heading"><div><span className="dashboard-kicker">Your submissions</span><h2>My E-waste Products</h2><p>Products and pickup requests you have submitted.</p></div><a className="button button-primary" href="/book-pickup">Add another product</a></div>
        <PickupRequestsTable requests={counts.requests} preferences={preferences} onPreferenceChange={handlePreferenceChange} savingPreference={savingPreference} {...offerTableProps} />
      </section>}
      {!loading && !error && counts.total > 0 && <section className="dashboard-my-products">
        <div className="dashboard-my-products-heading"><div><span className="dashboard-kicker">Live updates</span><h2>Pickup Progress</h2><p>Track each request from submission through completion.</p></div><a className="text-link" href="/track-request">Track by request ID <span aria-hidden="true">→</span></a></div>
        <PickupTrackingCards requests={counts.requests} />
      </section>}
    </main>
  );
}

export default DashboardPage;