import { useEffect, useRef, useState } from 'react';
import { deleteCustomerAccount, readRecord, subscribeToAssignedData, updatePickupRequest } from '../services/databaseService';
import { createRegistrationInvite } from '../services/inviteService';

const requestStatuses = ['Pending', 'Approved', 'Rejected', 'Completed'];
const itemCategories = ['Mobile', 'Laptop', 'Computer', 'Tablet', 'Printer', 'Battery', 'Accessories', 'Other'];

function formatPrice(price) {
  return `₹${Number(price).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function getTodayDate() {
  const today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  return today.toISOString().slice(0, 10);
}

function getRequests(data) {
  return Object.entries(data || {}).flatMap(([uid, userRequests]) =>
    Object.entries(userRequests || {})
      .filter(([, request]) => request && typeof request === 'object')
      .map(([requestId, request]) => ({ ...request, uid, requestId })),
  ).sort((first, second) =>
    Number(second.updatedAt || second.createdAt || 0) - Number(first.updatedAt || first.createdAt || 0),
  );
}

function formatDate(timestamp) {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function getCounts(requests) {
  return requests.reduce((counts, request) => {
    counts.total += 1;
    const status = String(request.status || '').toLowerCase();
    if (status === 'pending') counts.pending += 1;
    if (status === 'approved') counts.approved += 1;
    if (status === 'completed') {
      counts.completed += 1;
      const price = Number(request.price);
      if (Number.isFinite(price) && price >= 0) counts.collectedAmount += price;
    }
    return counts;
  }, { total: 0, pending: 0, approved: 0, completed: 0, collectedAmount: 0 });
}

function AdminPageHeading({ eyebrow = 'Operations', title, description, children }) {
  return <div className="admin-page-heading"><div><span className="dashboard-kicker">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{children}</div>;
}

function AdminDashboard({ adminUid, adminName }) {
  const [summary, setSummary] = useState({ users: 0, total: 0, pending: 0, approved: 0, completed: 0, collectedAmount: 0, requests: [] });
  const [greetingName, setGreetingName] = useState(adminName || 'Admin');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    const unsubscribe = subscribeToAssignedData(
      adminUid,
      ({ profiles, requests }) => {
        if (!active) return;
        const recentRequests = getRequests(requests).map((request) => ({ ...request, user: profiles[request.uid] }));
        setGreetingName(profiles[adminUid]?.username || profiles[adminUid]?.name || adminName || 'Admin');
        setSummary({
          users: Object.values(profiles).filter((profile) => profile?.role === 'user').length,
          ...getCounts(recentRequests),
          requests: recentRequests,
        });
        setLoading(false);
      },
      () => {
        if (active) setError('Couldn’t load admin statistics. Check Firebase configuration and admin database rules, then retry.');
        if (active) setLoading(false);
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [adminName, adminUid, retryKey]);

  const stats = [
    ['Total requests', summary.total, 'Pickup records', '↗', 'requests'],
    ['Pending requests', summary.pending, 'Awaiting a decision', '◷', 'pending'],
    ['Collected pickups', summary.completed, 'Successfully collected', '✓', 'completed'],
    ['In progress', summary.approved, 'Approved for collection', '◌', 'progress'],
    ['Total sales value', formatPrice(summary.collectedAmount), 'Collected products only', '₹', 'sales'],
  ];
  const recentRequests = summary.requests.slice(0, 4);
  const latestActivity = summary.requests.slice(0, 3);
  const totalWeight = summary.requests.reduce((total, request) => total + (Number(request.itemDetails?.approxWeightKg) || 0), 0);

  return (
    <main className="admin-main admin-overview container">
      {loading && <p className="admin-feedback" role="status"><span className="loading-spinner" aria-hidden="true" />Loading live Firebase data...</p>}
      {error && <div className="admin-alert" role="alert"><p>{error}</p><button className="button button-light" type="button" onClick={() => setRetryKey((key) => key + 1)}>Retry</button></div>}
      <section className="admin-welcome-banner">
        <div><span className="dashboard-kicker">Administration</span><h1>Welcome back, {greetingName} <span aria-hidden="true">👋</span></h1><p>Keep track of collections and help build a cleaner, greener tomorrow.</p></div>
        <div className="admin-welcome-art" aria-hidden="true"><span>♻</span><i /><i /><i /></div>
        <div className="admin-welcome-note"><strong>Your e-waste<br />matters!</strong><span>Recycle&nbsp; · &nbsp;Reuse&nbsp; · &nbsp;Save</span></div>
      </section>
      <section className="admin-overview-stats" aria-label="Portal statistics">
        {stats.map(([label, value, detail, icon, tone]) => <article className={`admin-overview-stat stat-${tone}`} key={label}>
          <span className="admin-overview-stat-icon" aria-hidden="true">{icon}</span>
          <div><span>{label}</span><strong>{loading ? '—' : value}</strong><small>{detail}</small></div>
        </article>)}
      </section>
      <div className="admin-overview-grid">
        <div className="admin-overview-main-column">
          <section className="admin-overview-panel">
            <div className="admin-overview-panel-heading"><h2><span aria-hidden="true">▤</span> Recent Pickup Requests</h2><a href="/admin/requests">View all <span aria-hidden="true">→</span></a></div>
            {loading && <p className="admin-feedback">Loading requests...</p>}
            {!loading && !error && recentRequests.length === 0 && <div className="admin-overview-empty"><h3>No pickup requests yet</h3><p>Requests will appear here after customers book a pickup.</p><a className="text-link" href="/admin/requests">Open pickup requests <span aria-hidden="true">→</span></a></div>}
            {!loading && recentRequests.length > 0 && <div className="admin-overview-table-wrap"><table className="admin-overview-table">
              <thead><tr><th>Request ID</th><th>Item details</th><th>Pickup address</th><th>Date</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>{recentRequests.map((request) => {
                const item = request.itemDetails || {};
                const pickup = request.pickupDetails || {};
                return <tr key={`${request.uid}/${request.requestId}`}>
                  <td><code>{request.requestId}</code></td>
                  <td><strong>{item.name || item.category || 'E-waste item'}</strong><small>{request.user?.username || request.user?.name || 'Customer'} · {request.user?.email || request.uid}</small><small>{item.category || 'Category not set'}{item.quantity ? ` · ${item.quantity} pcs` : ''}</small></td>
                  <td>{pickup.address || 'Address not set'}<small>{[pickup.city, pickup.pinCode].filter(Boolean).join(', ') || '—'}</small></td>
                  <td>{formatDate(request.createdAt)}</td>
                  <td><StatusBadge status={request.status} /></td>
                  <td><a className="admin-overview-view-link" href="/admin/requests">View</a></td>
                </tr>;
              })}</tbody>
            </table></div>}
          </section>
          <section className="admin-overview-panel admin-activity-panel">
            <div className="admin-overview-panel-heading"><h2><span aria-hidden="true">⌁</span> Recent Activity</h2><a href="/admin/requests">View all <span aria-hidden="true">→</span></a></div>
            {latestActivity.length === 0
              ? <p className="admin-overview-muted">New pickup activity will appear here.</p>
              : <ul>{latestActivity.map((request) => <li key={`${request.uid}/${request.requestId}`}><span className="admin-activity-dot" /><time>{formatDate(request.updatedAt || request.createdAt)}</time><span>{`Pickup request ${request.requestId} · ${request.status || 'Submitted'}`}</span></li>)}</ul>}
          </section>
        </div>
        <aside className="admin-overview-side-column">
          <section className="admin-overview-panel admin-quick-actions">
            <h2><span aria-hidden="true">ϟ</span> Quick Actions</h2>
            <a className="admin-quick-action primary" href="/admin/requests"><span aria-hidden="true">▣</span> Manage Pickup Requests <span aria-hidden="true">→</span></a>
            <a className="admin-quick-action" href="/admin/invites"><span aria-hidden="true">＋</span> Create Admin Invite <span aria-hidden="true">→</span></a>
            <a className="admin-quick-action" href="/admin/users"><span aria-hidden="true">◎</span> View Users <span aria-hidden="true">→</span></a>
          </section>
          <section className="admin-overview-panel admin-impact-card">
            <h2><span aria-hidden="true">♧</span> Eco Impact</h2>
            <div className="admin-impact-metrics"><div><strong>{loading ? '—' : totalWeight ? `${totalWeight} kg` : '—'}</strong><span>{totalWeight ? 'Estimated e-waste listed' : 'No weight data recorded'}</span></div><div><strong>{loading ? '—' : summary.users}</strong><span>Customer accounts</span></div></div>
            <p>Responsible pickups help keep electronics in the reuse and recycling loop.</p>
          </section>
          <section className="admin-overview-help"><span aria-hidden="true">?</span><div><strong>Need help?</strong><p>Contact us about the portal or pickup process.</p></div><a href="/#contact" aria-label="Get help">→</a></section>
        </aside>
      </div>
    </main>
  );
}

function StatusBadge({ status }) {
  const normalized = String(status || 'Unknown').toLowerCase();
  const label = normalized === 'completed' ? 'Collected' : status || 'Unknown';
  return <span className={`admin-status status-${normalized.replace(/[^a-z0-9]+/g, '-')}`}>{label}</span>;
}

function RequestManagement({ adminUid }) {
  const [requests, setRequests] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [collectors, setCollectors] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionKey, setActionKey] = useState('');
  const [rejectionNotes, setRejectionNotes] = useState({});
  const [collectionDates, setCollectionDates] = useState({});
  const [selectedCollectors, setSelectedCollectors] = useState({});
  const [retryKey, setRetryKey] = useState(0);
  const previousRequestStatuses = useRef(new Map());

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    const unsubscribe = subscribeToAssignedData(
      adminUid,
      ({ profiles: assignedProfiles, requests: assignedRequests }) => {
        if (!active) return;
        const latestRequests = getRequests(assignedRequests);
        const previousStatuses = previousRequestStatuses.current;
        const resubmittedOffer = latestRequests.find((request) =>
          String(request.status || '').toLowerCase() === 'pending'
          && previousStatuses.get(`${request.uid}/${request.requestId}`) === 'rejected',
        );
        if (resubmittedOffer) {
          setStatusFilter('all');
          setActionMessage(`A customer submitted a new price offer for request ${resubmittedOffer.requestId}.`);
        }
        previousRequestStatuses.current = new Map(latestRequests.map((request) => [
          `${request.uid}/${request.requestId}`,
          String(request.status || '').toLowerCase(),
        ]));
        setRequests(latestRequests);
        setProfiles(assignedProfiles);
        setLoading(false);
      },
      () => {
        if (active) {
          setError('Couldn’t load requests or collectors. Check admin database access and try again.');
          setLoading(false);
        }
      },
    );

    readRecord('collectors')
      .then((collectorData) => {
        if (!active) return;
        setCollectors(Object.entries(collectorData || {})
          .filter(([, collector]) => collector && typeof collector === 'object' && collector.active !== false)
          .map(([id, collector]) => ({
            id,
            name: collector.name || collector.fullName || collector.email || id,
          })));
      })
      .catch(() => {
        if (active) {
          setError('Couldn’t load requests or collectors. Check admin database access and try again.');
          setLoading(false);
        }
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [adminUid, retryKey]);

  const filteredRequests = requests.filter((request) => {
    const matchesStatus = statusFilter === 'all' || String(request.status || '').toLowerCase() === statusFilter.toLowerCase();
    const matchesCategory = categoryFilter === 'all' || request.itemDetails?.category === categoryFilter;
    return matchesStatus && matchesCategory;
  });

  const runRequestAction = async (request, updates, confirmation, successMessage) => {
    if (actionKey || !window.confirm(confirmation)) return;
    const key = `${request.uid}/${request.requestId}`;
    setActionKey(key);
    setActionError('');
    setActionMessage('');
    try {
      await updatePickupRequest(request.uid, request.requestId, updates);
      setActionMessage(successMessage);
      setRetryKey((value) => value + 1);
    } catch {
      setActionError('That update could not be saved. Confirm this account has the Firebase admin claim and try again.');
    } finally {
      setActionKey('');
    }
  };

  const assignCollector = (request) => {
    const key = `${request.uid}/${request.requestId}`;
    const collectorId = selectedCollectors[key] || request.collectorId || '';
    const collector = collectors.find((candidate) => candidate.id === collectorId);
    if (!collector) {
      setActionError('Choose an available collector first.');
      return;
    }
    runRequestAction(request, { collectorId: collector.id, collectorName: collector.name }, `Assign ${collector.name} to request ${request.requestId}?`, `Collector assigned to request ${request.requestId}.`);
  };

  const approveRequest = (request) => {
    const price = Number(request.offerPrice);
    if (request.offerPrice === undefined || !Number.isFinite(price) || price < 0) {
      setActionError(`Customer price offer is missing for request ${request.requestId}. Ask the customer to submit a price first.`);
      return;
    }
    runRequestAction(request, { status: 'Approved', price }, `Accept request ${request.requestId} at ${formatPrice(price)}?`, `Request ${request.requestId} accepted at ${formatPrice(price)}.`);
  };

  const rejectRequest = (request) => {
    const key = `${request.uid}/${request.requestId}`;
    const rejectionNote = (rejectionNotes[key] ?? '').trim();
    if (rejectionNote.length < 3) {
      setActionError(`Add a short reason before rejecting request ${request.requestId}.`);
      return;
    }
    runRequestAction(request, { status: 'Rejected', rejectionNote }, `Reject request ${request.requestId} and send this note to the customer?`, `Request ${request.requestId} rejected with a customer note.`);
  };

  const confirmDeliveryOption = (request) => {
    if (request.deliveryStatus === 'awaiting_admin' || !request.deliveryStatus) {
      runRequestAction(
        request,
        { deliveryStatus: 'accepted', collectionDate: null },
        `Accept the customer's delivery choice for request ${request.requestId}?`,
        `Delivery choice accepted for request ${request.requestId}. Set the date next.`,
      );
      return;
    }

    const collectionDate = collectionDates[`${request.uid}/${request.requestId}`] || '';
    if (!collectionDate || collectionDate < getTodayDate()) {
      setActionError('Choose today or a future date before confirming the delivery plan.');
      return;
    }
    runRequestAction(
      request,
      { deliveryStatus: 'scheduled', collectionDate },
      `Set ${request.deliveryOption === 'self_dropoff' ? 'the customer delivery deadline' : 'the collection date'} for request ${request.requestId} to ${collectionDate}?`,
      `Delivery date set for request ${request.requestId}: ${collectionDate}.`,
    );
  };

  const markRequestCollected = (request) => {
    runRequestAction(
      request,
      { status: 'Completed', deliveryStatus: 'collected', collectedAt: Date.now() },
      `Mark request ${request.requestId} as collected? The customer will see it as delivered.`,
      `Request ${request.requestId} marked as collected.`,
    );
  };

  return (
    <main className="admin-main container">
      <AdminPageHeading title="Pickup requests" description="Review customer price offers, confirm delivery choices, schedule collections, and assign collectors."><span className="admin-result-count">{loading ? 'Loading…' : `${requests.length} total`}</span></AdminPageHeading>
      <section className="admin-filter-bar" aria-label="Filter pickup requests">
        <label>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{requestStatuses.map((status) => <option key={status} value={status}>{status === 'Completed' ? 'Collected' : status}</option>)}</select></label>
        <label>Item category<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">All categories</option>{itemCategories.map((category) => <option value={category} key={category}>{category}</option>)}</select></label>
      </section>
      {loading && <p className="admin-feedback" role="status"><span className="loading-spinner" aria-hidden="true" />Loading pickup requests...</p>}
      {error && <div className="admin-alert" role="alert"><p>{error}</p><button className="button button-light" type="button" onClick={() => setRetryKey((key) => key + 1)}>Retry</button></div>}
      {actionMessage && <p className="admin-success" role="status">{actionMessage}</p>}
      {actionError && <p className="admin-alert" role="alert">{actionError}</p>}
      {!loading && !error && requests.length > 0 && collectors.length === 0 && <p className="admin-info">No collector records exist yet. Add active records under <code>collectors/{'{collectorId}'}</code> to enable assignment.</p>}
      {!loading && !error && requests.length === 0 && <section className="admin-empty"><h2>No pickup requests found</h2><p>Submitted requests will appear here. No sample records are shown.</p></section>}
      {!loading && !error && requests.length > 0 && filteredRequests.length === 0 && <section className="admin-empty"><h2>No requests match these filters</h2><p>Change the status or category filters to see other requests.</p></section>}
      {!loading && !error && filteredRequests.length > 0 && <div className="admin-table-wrap"><table className="admin-table"><caption className="sr-only">Pickup requests with customer, item, pickup, status, and admin actions</caption><thead><tr><th>Request ID</th><th>Customer</th><th>Item details</th><th>Pickup address</th><th>Created</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {filteredRequests.map((request) => {
          const key = `${request.uid}/${request.requestId}`;
          const item = request.itemDetails || {};
          const pickup = request.pickupDetails || {};
          const profile = profiles[request.uid] || {};
          const status = String(request.status || '').toLowerCase();
          return <tr key={key}>
            <td><code>{request.requestId}</code></td>
            <td><strong>{profile.username || profile.name || 'Customer'}</strong><span>{profile.email || request.uid}</span></td>
            <td><strong>{item.category || 'Uncategorized'}</strong><span>{item.name || '—'}{item.quantity ? ` · Qty ${item.quantity}` : ''}{item.approxWeightKg ? ` · ${item.approxWeightKg} kg` : ''}</span>{item.condition && <span>{item.condition}</span>}</td>
            <td><span>{pickup.address || '—'}</span><span>{[pickup.city, pickup.pinCode].filter(Boolean).join(', ')}</span></td>
            <td>{formatDate(request.createdAt)}</td>
            <td><StatusBadge status={request.status} />{status === 'rejected' && request.rejectionNote && <span className="rejection-note">{request.rejectionNote}</span>}{status === 'approved' && request.price !== undefined && <span className="assigned-label">Accepted: {formatPrice(request.price)}</span>}{request.deliveryOption && <span className="assigned-label">{request.deliveryStatus === 'collected' ? 'Product collected' : request.deliveryOption === 'self_dropoff' ? 'Customer will deliver' : 'Admin pickup'}{request.deliveryStatus === 'scheduled' && request.collectionDate ? ` · Date: ${request.collectionDate}` : ['accepted', 'confirmed'].includes(request.deliveryStatus) ? ' · Accepted, date needed' : request.deliveryStatus === 'collected' ? '' : ' · Awaiting acceptance'}</span>}{request.collectorName && <span className="assigned-label">{request.collectorName}</span>}</td>
            <td className="admin-row-actions">
              {status === 'pending' && <><span className="admin-offer-price">Customer offer: {request.offerPrice === undefined ? 'Not submitted' : formatPrice(request.offerPrice)}</span><button className="table-action approve-action" type="button" disabled={Boolean(actionKey) || request.offerPrice === undefined} onClick={() => approveRequest(request)}>{actionKey === key ? 'Saving…' : 'Accept offer'}</button><label className="rejection-note-control" htmlFor={`rejection-note-${request.requestId}`}>Reason for rejection<textarea id={`rejection-note-${request.requestId}`} rows="2" maxLength="500" value={rejectionNotes[key] ?? ''} onChange={(event) => setRejectionNotes((current) => ({ ...current, [key]: event.target.value }))} disabled={Boolean(actionKey)} placeholder="Explain why this offer is rejected" /></label><button className="table-action reject-action" type="button" disabled={Boolean(actionKey)} onClick={() => rejectRequest(request)}>{actionKey === key ? 'Saving…' : 'Reject with note'}</button></>}
              {status === 'approved' && request.deliveryOption && ['awaiting_admin', undefined].includes(request.deliveryStatus) && <button className="table-action approve-action" type="button" disabled={Boolean(actionKey)} onClick={() => confirmDeliveryOption(request)}>{actionKey === key ? 'Saving…' : 'Accept delivery choice'}</button>}
              {status === 'approved' && request.deliveryOption && ['accepted', 'confirmed'].includes(request.deliveryStatus) && <div className="collection-date-control"><label htmlFor={`collection-date-${request.requestId}`}>{request.deliveryOption === 'self_dropoff' ? 'Customer delivery deadline' : 'Collection date'}<input id={`collection-date-${request.requestId}`} type="date" min={getTodayDate()} value={collectionDates[key] || ''} onChange={(event) => setCollectionDates((current) => ({ ...current, [key]: event.target.value }))} disabled={Boolean(actionKey)} /></label><button className="table-action approve-action" type="button" disabled={Boolean(actionKey)} onClick={() => confirmDeliveryOption(request)}>{actionKey === key ? 'Saving…' : 'Set date'}</button></div>}
              {status === 'approved' && request.deliveryStatus === 'scheduled' && <button className="table-action approve-action" type="button" disabled={Boolean(actionKey)} onClick={() => markRequestCollected(request)}>{actionKey === key ? 'Saving…' : 'Mark as collected'}</button>}
              {status === 'approved' && <div className="assign-control"><label className="sr-only" htmlFor={`collector-${request.requestId}`}>Assign collector to request {request.requestId}</label><select id={`collector-${request.requestId}`} value={selectedCollectors[key] ?? request.collectorId ?? ''} onChange={(event) => setSelectedCollectors((current) => ({ ...current, [key]: event.target.value }))} disabled={!collectors.length || Boolean(actionKey)}><option value="">Select collector</option>{collectors.map((collector) => <option key={collector.id} value={collector.id}>{collector.name}</option>)}</select><button className="table-action approve-action" type="button" disabled={!collectors.length || Boolean(actionKey)} onClick={() => assignCollector(request)}>{actionKey === key ? 'Saving…' : 'Assign'}</button></div>}
              {status !== 'pending' && status !== 'approved' && <span className="muted-action">No action</span>}
            </td>
          </tr>;
        })}
      </tbody></table></div>}
    </main>
  );
}

function ManageUsers({ adminUid }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deletingUid, setDeletingUid] = useState('');
  const [deleteMessage, setDeleteMessage] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    readRecord(`adminUsers/${adminUid}`)
      .then((data) => {
        if (active) setUsers(Object.entries(data || {}).filter(([, profile]) => profile && typeof profile === 'object').map(([uid, profile]) => ({ uid, ...profile })));
      })
      .catch(() => { if (active) setError('Couldn’t load user profiles. Check admin database rules and try again.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retryKey]);

  const deleteUser = async (profile) => {
    const name = profile.username || profile.name || profile.email || profile.uid;
    if (deletingUid || !window.confirm(`Permanently delete ${name} and their pickup history? This also deletes their sign-in account and cannot be undone.`)) return;
    setDeletingUid(profile.uid);
    setDeleteError('');
    setDeleteMessage('');
    try {
      await deleteCustomerAccount(profile.uid);
      setUsers((current) => current.filter((user) => user.uid !== profile.uid));
      setDeleteMessage(`${name} and their account data were deleted.`);
    } catch (deleteFailure) {
      setDeleteError(deleteFailure.message || `Couldn’t delete ${name}.`);
    } finally {
      setDeletingUid('');
    }
  };

  return <main className="admin-main container">
    <AdminPageHeading title="Users" description="View accounts registered with your invites and permanently delete a customer account with its pickup data."><span className="admin-result-count">{loading ? 'Loading…' : `${users.length} users`}</span></AdminPageHeading>
    {loading && <p className="admin-feedback" role="status"><span className="loading-spinner" aria-hidden="true" />Loading user profiles...</p>}
    {error && <div className="admin-alert" role="alert"><p>{error}</p><button className="button button-light" type="button" onClick={() => setRetryKey((key) => key + 1)}>Retry</button></div>}
    {deleteError && <p className="admin-alert" role="alert">{deleteError}</p>}
    {deleteMessage && <p className="admin-success" role="status">{deleteMessage}</p>}
    {!loading && !error && users.length === 0 && <section className="admin-empty"><h2>No user profiles found</h2><p>Profiles will appear here after users register. No sample accounts are included.</p></section>}
    {!loading && !error && users.length > 0 && <div className="admin-table-wrap"><table className="admin-table"><caption className="sr-only">Accounts registered using your invites</caption><thead><tr><th>Username</th><th>Email</th><th>User ID</th><th>Account type</th><th>Created</th><th>Actions</th></tr></thead><tbody>{users.map((profile) => <tr key={profile.uid}><td><strong>{profile.username || profile.name || 'Name not provided'}</strong></td><td>{profile.email || '—'}</td><td><code>{profile.uid}</code></td><td>{profile.role || '—'}</td><td>{formatDate(profile.createdAt)}</td><td>{profile.role === 'user' && <button className="table-action reject-action" type="button" disabled={Boolean(deletingUid)} onClick={() => deleteUser(profile)}>{deletingUid === profile.uid ? 'Deleting…' : 'Delete account'}</button>}</td></tr>)}</tbody></table></div>}
  </main>;
}

function RegistrationInvites() {
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const createInvite = async (role) => {
    setLoading(true);
    setError('');
    setInvite(null);
    setCopied(false);
    try {
      setInvite(await createRegistrationInvite(role));
    } catch (inviteError) {
      setError(inviteError.message || 'Could not create the registration invite.');
    } finally {
      setLoading(false);
    }
  };

  const inviteLink = invite
    ? `${window.location.origin}/?register=1&type=${encodeURIComponent(invite.role)}&invite=${encodeURIComponent(invite.code)}`
    : '';

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
    } catch {
      setError('Could not copy the invite link. Select and copy it manually.');
    }
  };

  return <main className="admin-main container">
    <AdminPageHeading title="Registration invites" description="Create single-use links for customers or new administrators. Invites expire after seven days." />
    <section className="invite-create-panel">
      <p className="invite-create-label">Create a fresh, single-use link for:</p>
      <div className="invite-create-actions">
        <button className="button button-primary" type="button" disabled={loading} onClick={() => createInvite('customer')}>{loading ? 'Creating invite…' : 'Create Customer Invite'}</button>
        <button className="button button-primary" type="button" disabled={loading} onClick={() => createInvite('admin')}>{loading ? 'Creating invite…' : 'Create Admin Invite'}</button>
      </div>
    </section>
    {error && <p className="admin-alert" role="alert">{error}</p>}
    {invite && <section className="invite-result-panel" aria-live="polite">
      <h2>{invite.role === 'admin' ? 'Admin invite created' : 'Customer invite created'}</h2>
      <p>This link is single-use and expires {new Date(invite.expiresAt).toLocaleString()}.</p>
      <label htmlFor="registration-invite-link">Share this registration link</label>
      <div className="invite-link-row"><input id="registration-invite-link" readOnly value={inviteLink} onFocus={(event) => event.target.select()} /><button className="button button-primary" type="button" onClick={copyInvite}>{copied ? 'Copied' : 'Copy link'}</button></div>
      <p className="invite-code-note">Treat this link like a password. Anyone who has it can use the invite before it expires.</p>
    </section>}
  </main>;
}

const placeholders = {
  '/admin/collectors': ['Collectors', 'Collector management is not available yet. Add verified collector profiles at collectors/{collectorId} before assigning requests.'],
  '/admin/centers': ['Recycling centers', 'Recycling center management will be available in a future update. No sample centers are displayed.'],
  '/admin/reports': ['Reports', 'Reporting will be available after enough real pickup data has been collected.'],
};

function AdminDashboardPage({ path, adminUid, adminUser }) {
  if (path === '/admin/requests') return <RequestManagement adminUid={adminUid} />;
  if (path === '/admin/users') return <ManageUsers adminUid={adminUid} />;
  if (path === '/admin/invites') return <RegistrationInvites />;
  if (placeholders[path]) {
    const [title, description] = placeholders[path];
    return <main className="admin-main container"><section className="admin-empty admin-placeholder"><span className="dashboard-kicker">Administration</span><h1>{title}</h1><p>{description}</p><a href="/admin" className="button button-primary">Back to admin dashboard</a></section></main>;
  }
  return <AdminDashboard adminUid={adminUid} adminName={adminUser?.displayName || adminUser?.email?.split('@')[0]} />;
}

export default AdminDashboardPage;