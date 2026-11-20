import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api';
import { formatDate } from './dates';
import './styles.css';

const tabs = ['Rooms', 'Bookings', 'Staff', 'Functions', 'Procedures', 'Logs'];
const money = value => value == null || value === '-' ? '—' :
  new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 }).format(Number(value));

function ErrorMessage({ error }) {
  if (!error) return null;
  return <div className="notice error" role="alert">
    <strong>{error.code === 'DATABASE_RULE' ? 'Database error' : 'Request could not be completed'}</strong>
    <p>{error.message}</p>
    {error.sqlNumber && <span className="muted">SQL Server error {error.sqlNumber}</span>}
  </div>;
}

function useResource(path, revision = 0) {
  const [state, setState] = useState({ data: null, loading: Boolean(path), error: null });
  useEffect(() => {
    const controller = new AbortController();
    setState({ data: null, loading: Boolean(path), error: null });
    if (path) api(path, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setState({ data, loading: false, error: null }); })
      .catch(error => { if (!controller.signal.aborted) setState({ data: null, loading: false, error }); });
    return () => controller.abort();
  }, [path, revision]);
  return state;
}

function ResourceState({ state, children }) {
  if (state.loading) {
    return <p className="muted" role="status">Loading…</p>;
  }
  if (state.error) {
    return <ErrorMessage error={state.error} />;
  }
  return state.data !== null ? children(state.data) : null;
}

function Table({ columns, rows, label, empty = 'No records found.' }) {
  if (!rows.length) {
    return <p className="empty">{empty}</p>;
  }

  return <div className="table-scroll" role="region" aria-label={label} tabIndex={0}>
    <table>
      <caption className="sr-only">{label}</caption>
      <thead><tr>{columns.map(c => <th key={c.key} scope="col">{c.label}</th>)}</tr></thead>
      <tbody>{rows.map((row, index) => <tr key={row.Id ?? row.LogID ?? row.BookingID ?? row.StaffID ?? row.RoomID ?? index}>
        {columns.map(c => <td key={c.key}>{c.render ? c.render(row) : (row[c.key] ?? '—')}</td>)}
      </tr>)}</tbody>
    </table>
  </div>;
}

const roomColumns = [
  { key: 'RoomNumber', label: 'Room' }, { key: 'CategoryName', label: 'Category' },
  { key: 'PricePerNight', label: 'Price / night', render: row => money(row.PricePerNight) },
];
const bookingColumns = [
  { key: 'BookingID', label: 'Booking' }, { key: 'GuestName', label: 'Guest' },
  { key: 'RoomNumber', label: 'Room' },
  { key: 'CheckInDate', label: 'Check-in', render: row => formatDate(row.CheckInDate) },
  { key: 'NightsCount', label: 'Nights' },
  { key: 'TotalPrice', label: 'Total', render: row => money(row.TotalPrice) },
];


const entityConfig = {
  rooms: { title: 'Rooms', singular: 'room', id: 'RoomID', fields: [
    { name: 'roomNumber', source: 'RoomNumber', label: 'Room number', max: 10, required: true },
    { name: 'pricePerNight', source: 'PricePerNight', label: 'Price / night', type: 'number', required: true },
    { name: 'status', source: 'StoredStatus', label: 'Status', max: 20, initial: 'Free' },
    { name: 'categoryId', source: 'CategoryID', label: 'Category', select: 'categories' },
    { name: 'description', source: 'Description', label: 'Description', max: 100 },
  ] },
  bookings: { title: 'Bookings', singular: 'booking', id: 'BookingID', fields: [
    { name: 'guestName', source: 'GuestName', label: 'Guest name', max: 50, required: true },
    { name: 'roomId', source: 'RoomID', label: 'Room', select: 'rooms', required: true },
    { name: 'checkInDate', source: 'CheckInDate', label: 'Check-in date', type: 'date', required: true },
    { name: 'nightsCount', source: 'NightsCount', label: 'Nights', type: 'number', integer: true, required: true, initial: 1 },
    { name: 'totalPrice', source: 'TotalPrice', label: 'Total price', type: 'number', required: true },
  ] },
  staff: { title: 'Staff', singular: 'employee', id: 'StaffID', fields: [
    { name: 'name', source: 'Name', label: 'Name', max: 50, required: true },
    { name: 'categoryId', source: 'CategoryID', label: 'Category', select: 'categories' },
    { name: 'information', source: 'Information', label: 'Information', max: 40 },
  ] },
};

const staffColumns = [
  { key: 'Name', label: 'Name' }, { key: 'CategoryName', label: 'Category' },
  { key: 'Information', label: 'Information' },
];

function RecordModal({ editor, categories, rooms, close, saved }) {
  const dialog = React.useRef(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const config = entityConfig[editor.entity];
  useEffect(() => {
    const node = dialog.current;
    node.showModal();
    return () => node.close();
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (pending) return;
    const body = Object.fromEntries(new FormData(event.currentTarget));
    setPending(true); setError(null);
    try {
      const result = await api('/' + editor.entity + (editor.record ? '/' + editor.record[config.id] : ''), {
        method: editor.record ? 'PUT' : 'POST', body: JSON.stringify(body),
      });
      saved(result.message); close();
    } catch (failure) { setError(failure); setPending(false); }
  }

  return <dialog ref={dialog} className="record-modal" aria-labelledby="modal-title"
    onCancel={event => { event.preventDefault(); if (!pending) close(); }}>
    <div className="section-heading"><h2 id="modal-title">{editor.record ? 'Edit' : 'Add'} {config.singular}</h2>
      <button type="button" className="secondary" disabled={pending} onClick={close}>Close</button></div>
    <form onSubmit={submit}>
      <fieldset disabled={pending} className="field-grid">
        {config.fields.map(field => {
          const value = editor.record?.[field.source] ?? (editor.record ? '' : field.initial ?? '');
          const options = field.select === 'categories' ? categories.map(c => [c.CategoryID, c.CategoryName]) :
            field.select === 'rooms' ? rooms.map(r => [r.RoomID, 'Room ' + r.RoomNumber]) : [];
          return <label key={field.name}>{field.label}
            {field.select ? <select name={field.name} required={field.required} defaultValue={value}>
              <option value="">{field.required ? 'Select a room' : 'Unassigned'}</option>
              {options.map(([id, label]) => <option value={id} key={id}>{label}</option>)}
            </select> : <input lang={field.type === 'date' ? 'uk-UA' : undefined} name={field.name} type={field.type || 'text'} required={field.required}
              maxLength={field.max} min={field.type === 'date' ? '0001-01-01' : field.integer ? 1 : field.type === 'number' ? 0 : undefined}
              max={field.type === 'date' ? '9999-12-31' : field.integer ? 2147483647 : undefined}
              step={field.type === 'number' ? field.integer ? '1' : 'any' : undefined}
              defaultValue={field.type === 'date' ? (value ? String(value).slice(0, 10) : '') : value} />}
          </label>;
        })}
      </fieldset>
      <ErrorMessage error={error} />
      <div className="modal-actions"><button type="button" className="secondary" onClick={close} disabled={pending}>Cancel</button>
        <button disabled={pending}>{pending ? 'Saving…' : 'Save'}</button></div>
    </form>
  </dialog>;
}

function RoomDetails({ selected, revision, close, occupancyDate }) {
  const detail = useResource('/rooms/' + selected + '?date=' + encodeURIComponent(occupancyDate), revision);

  return <section className="panel" aria-label="Selected room details">
    <ResourceState state={detail}>{room => <>
      <div className="section-heading"><h2>Room {room.RoomNumber}</h2><button className="secondary" onClick={close}>Close details</button></div>
      <dl className="details">
        <div><dt>Category</dt><dd>{room.CategoryName || 'Unassigned'}</dd></div>
        <div><dt>Price / night</dt><dd>{money(room.PricePerNight)}</dd></div>
        <div><dt>Status</dt><dd>{room.Status || '—'}</dd></div>
      </dl>
      {room.Description && <p>{room.Description}</p>}
      <h3>Bookings</h3>
      <Table label={'Bookings for room ' + room.RoomNumber} rows={room.bookings}
        columns={bookingColumns.filter(c => c.key !== 'RoomNumber')} empty="This room has no bookings." />
    </>}</ResourceState>
  </section>;
}

function Records({ entity, state, revision, edit, remove, pending, occupancyDate }) {
  const config = entityConfig[entity];
  const [selected, setSelected] = useState(null);
  const columns = entity === 'rooms' ? [
    { key: 'RoomNumber', label: 'Room', render: row => <button className="text-button"
      onClick={() => setSelected(row.RoomID)}>Room {row.RoomNumber}</button> },
    ...roomColumns.slice(1), { key: 'Status', label: 'Status' },
  ] : entity === 'bookings' ? bookingColumns : staffColumns;

  return <div className="stack">
    <section className="panel">
      <div className="section-heading"><h2>{config.title}</h2>
        <button onClick={() => edit(entity, null)}>Add {config.singular}</button></div>
      <ResourceState state={state}>{rows => <Table label={config.title} rows={rows} columns={[...columns, {
        key: 'actions', label: 'Actions', render: row => <div className="row-actions">
          <button className="secondary" disabled={pending} onClick={() => edit(entity, row)}>Edit</button>
          <button className="secondary delete-button" disabled={pending} onClick={async () => {
            const deleted = await remove(entity, row[config.id]);
            if (deleted && row[config.id] === selected) setSelected(null);
          }}>Delete</button>
        </div>,
      }]} />}</ResourceState>
    </section>
    {entity === 'rooms' && selected && <RoomDetails selected={selected} revision={revision} occupancyDate={occupancyDate} close={() => setSelected(null)} />}
  </div>;
}

function Functions() {
  const [count, setCount] = useState({ data: null, loading: false, error: null });
  const [cheaper, setCheaper] = useState({ data: null, loading: false, error: null });

  async function run(event, endpoint, key, setter) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get(key);

    setter({ data: null, loading: true, error: null });
    try { 
      setter({ data: await api(endpoint + '?' + key + '=' + encodeURIComponent(value)), loading: false, error: null }); 
    } catch (error) { 
      setter({ data: null, loading: false, error }); 
    }
  }

  return <div className="two-column">
    <section className="panel"><h2>Booking count</h2>
      <form onSubmit={event => run(event, '/rooms/booking-count', 'roomNumber', setCount)}>
        <label>Room number<input name="roomNumber" required maxLength={10} defaultValue="301" /></label>
        <button disabled={count.loading}>{count.loading ? 'Loading…' : 'Count bookings'}</button>
      </form>
      <ResourceState state={count}>{result => <p className="result" role="status">Bookings: <strong>{result.count}</strong></p>}</ResourceState>
    </section>
    <section className="panel"><h2>Rooms below a price</h2>
      <form onSubmit={event => run(event, '/rooms/cheaper-than', 'maxPrice', setCheaper)}>
        <label>Maximum price / night<input name="maxPrice" type="number" min="0" step="any" required defaultValue="2000" /></label>
        <button disabled={cheaper.loading}>{cheaper.loading ? 'Loading…' : 'Find rooms'}</button>
      </form>
      <ResourceState state={cheaper}>{rows => <Table label="Rooms below maximum price" rows={rows}
        columns={roomColumns} empty="No rooms are priced below this amount." />}</ResourceState>
    </section>
  </div>;
}

function Procedures({ refresh }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    const threshold = new FormData(event.currentTarget).get('threshold');
    if (pending || !window.confirm('Delete eligible staff in categories with revenue below ' + threshold + '?')) return;
    setPending(true); setError(null); setMessage('');

    try {
      const result = await api('/staff/cleanup', { method: 'POST', body: JSON.stringify({ minTotalRevenue: threshold }) });
      setMessage(result.message); refresh();
    } catch (failure) { 
      setError(failure); 
    }
    finally { 
      setPending(false); 
    }
  }

  return <div className="stack"><section className="panel narrow"><h2>Staff cleanup</h2>
    <form onSubmit={submit}><label>Minimum category revenue
      <input name="threshold" type="number" min="0" step="any" required defaultValue="2000" /></label>
      <button className="danger" disabled={pending}>{pending ? 'Running…' : 'Run cleanup'}</button></form>
    {message && <p className="notice success" role="status">{message}</p>}<ErrorMessage error={error} />
  </section><ErrorDemo /></div>;
}

function ErrorDemo() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  async function trigger() {
    setPending(true); setError(null);
    try { 
      await api('/error-demo', { method: 'POST' }); 
    }
    catch (failure) { 
      setError(failure); 
    }
    finally { 
      setPending(false); 
    }
  }

  return <section className="panel narrow"><h2>Error demo</h2>
    <button disabled={pending} onClick={trigger}>{pending ? 'Loading…' : 'Trigger database error'}</button>
    <ErrorMessage error={error} />
  </section>;
}


function Logs() {
  const [revision, setRevision] = useState(0);
  const bookings = useResource('/logs/bookings', revision);
  const denied = useResource('/logs/access-denied', revision);

  return <div className="stack">
    <div className="section-heading"><h2>Logs</h2>
      <button className="secondary" disabled={bookings.loading || denied.loading}
        onClick={() => setRevision(value => value + 1)}>Refresh logs</button></div>
    <section className="panel"><h2>Booking updates</h2>
      <ResourceState state={bookings}>{rows => <Table label="Booking update logs" rows={rows} columns={[
        { key: 'Id', label: 'Log ID' }, { key: 'BookingID', label: 'Booking ID' },
        { key: 'ModifyDate', label: 'Modified at', render: row => formatDate(row.ModifyDate, true) },
      ]} empty="No booking updates recorded." />}</ResourceState>
    </section>
    <section className="panel"><h2>Denied operations</h2>
      <ResourceState state={denied}>{rows => <Table label="Denied operation logs" rows={rows} columns={[
        { key: 'LogID', label: 'Log ID' },
        { key: 'AttemptDate', label: 'Attempted at', render: row => formatDate(row.AttemptDate, true) },
        { key: 'Message', label: 'Message' },
      ]} empty="No denied operations recorded." />}</ResourceState>
    </section>
  </div>;
}


function OccupancyDate({ value, onChange }) {
  const [text, setText] = useState(() => formatDate(value));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { setText(formatDate(value)); setInvalid(false); }, [value]);

  function edit(event) {
    const next = event.target.value;
    setText(next);
    const match = next.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    const iso = match ? match[3] + '-' + match[2] + '-' + match[1] : '';
    const valid = Boolean(match && match[3] !== '0000' && formatDate(iso) === next);
    setInvalid(!valid);
    if (valid) onChange(iso);
  }
  return <div className="occupancy-date">
    <label htmlFor="occupancy-date-text">Occupancy date</label>
    <div className="occupancy-date-controls">
      <input id="occupancy-date-text" lang="uk-UA" type="text" inputMode="numeric"
        placeholder="DD.MM.YYYY" maxLength={10} value={text} onChange={edit}
        aria-invalid={invalid} aria-describedby={invalid ? 'occupancy-date-error' : undefined} />
      <label className="picker-trigger">Choose date
        <input type="date" lang="uk-UA" aria-label="Choose occupancy date"
          min="0001-01-01" max="9999-12-31" value={value}
          onClick={event => event.currentTarget.showPicker?.()}
          onChange={event => { if (event.target.value && event.target.validity.valid) onChange(event.target.value); }} />
      </label>
    </div>
    {invalid && <p id="occupancy-date-error" className="date-error" role="status">Enter a valid date as DD.MM.YYYY.</p>}
  </div>;
}

function App() {
  const [tab, setTab] = useState('Rooms');
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const [occupancyDate, setOccupancyDate] = useState(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  });
  const rooms = useResource('/rooms?date=' + encodeURIComponent(occupancyDate), revision);
  const bookings = useResource('/bookings', revision);
  const staff = useResource('/staff', revision);
  const categories = useResource('/categories');
  const refresh = () => setRevision(value => value + 1);

  function saved(text) { 
    setMessage(text); setError(null); refresh(); 
  }

  async function remove(entity, id) {
    if (pending || !window.confirm('Delete this ' + entityConfig[entity].singular + '?')) return false;
    setPending(true); setMessage(''); setError(null);

    try {
      const result = await api('/' + entity + '/' + id, { method: 'DELETE' });
      saved(result.message); return true;
    } catch (failure) { 
      setError(failure); return false; 
    }
    finally { 
      setPending(false); 
    }
  }

  const active = { Rooms: 'rooms', Bookings: 'bookings', Staff: 'staff' }[tab];
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header"><div className="header-inner"><h1>HotelDB</h1></div></header>
    <div className="shell">
      <nav className="tabs" aria-label="Sections">{tabs.map(item => <button key={item}
        aria-current={tab === item ? 'page' : undefined} onClick={() => {
          setTab(item); setMessage(''); setError(null);
        }}>{item}</button>)}</nav>
      <main id="main" tabIndex={-1}>
        {message && <p className="notice success" role="status">{message}</p>}
        <ErrorMessage error={error} />
        {categories.error && <ErrorMessage error={categories.error} />}
        {tab === 'Rooms' && <OccupancyDate value={occupancyDate} onChange={setOccupancyDate} />}
        {active && <Records key={active} entity={active} state={{ rooms, bookings, staff }[active]}
          revision={revision} edit={(entity, record) => setEditor({ entity, record })}
          remove={remove} pending={pending} occupancyDate={occupancyDate} />}
        {tab === 'Functions' && <Functions />}
        {tab === 'Procedures' && <Procedures refresh={refresh} />}
        {tab === 'Logs' && <Logs />}
      </main>
    </div>
    {editor && <RecordModal editor={editor} categories={categories.data || []} rooms={rooms.data || []}
      close={() => setEditor(null)} saved={saved} />}
  </>;
}
createRoot(document.getElementById('root')).render(<App />);