import { useEffect, useRef, useState } from 'react';

type Grant = { user_id?: string; email: string; role: string; scope?: string; pending?: boolean };
type TournamentList = { grants: Grant[]; invites: Grant[]; removed?: boolean };
export async function accessRequest<T>(url: string, token: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(url, {method,cache:'no-store',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},...(body ? {body:JSON.stringify(body)} : {})});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to update access');
  return result as T;
}
export function TournamentAccess({id,token,role,refresh}:{id:string;token:string;role:string;refresh:()=>Promise<unknown>}) {
  const [list,setList] = useState<TournamentList>({grants:[],invites:[]});
  const [email,setEmail] = useState(''), [grantRole,setGrantRole] = useState('director');
  const [busy,setBusy] = useState(false), [error,setError] = useState(''), [notice,setNotice] = useState('');
  const [loading,setLoading] = useState(true);
  const manager = ['admin','owner'].includes(role);
  const url = `/api/tournaments/${encodeURIComponent(id)}/access`;
  useEffect(()=>{
    let active=true;
    void accessRequest<TournamentList>(url,token).then(result=>{if(active){setList(result);setLoading(false)}}).catch(e=>{if(active){setError(e.message);setLoading(false)}});
    return ()=>{active=false};
  },[url,token]);
  async function change(method:string, item:Grant) {
    setBusy(true);setError('');setNotice('');
    try {
      const result=await accessRequest<TournamentList>(url,token,method,{email:item.email,userId:item.user_id,role:item.role});
      setList(result);if(method==='POST')setEmail('');setNotice(result.removed===false?'Not changed':'Access updated');
      await refresh();
    }catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  return <section className="ksm-access-section" data-testid="tournament-access"><h4>Owners &amp; directors</h4>
    <p>{manager?'Owners manage sharing and access. Directors can edit the tournament. Only admins can delete it.':'You can edit this tournament. Owners and admins manage access.'}</p>
    {loading && <p role="status">Loading access…</p>}
    <ul className="ksm-access-list">{[...list.grants,...list.invites.map(item=>({...item,pending:true}))].map(item=><li key={`${item.email}-${item.role}-${!!item.pending}`}>
      <div><strong>{item.email}</strong><span>{item.role==='owner'?'Owner':'Director'}{item.pending?' · Pending invite':''}</span></div>
      {manager && <button type="button" className="secondary" disabled={busy} aria-label={`Remove ${item.role} ${item.email}`} onClick={()=>{void change('DELETE',item)}}>Remove</button>}
    </li>)}</ul>
    {!loading && !list.grants.length && !list.invites.length && <p>No owners or directors assigned.</p>}
    {manager ? <form className="ksm-access-form" onSubmit={event=>{event.preventDefault();void change('POST',{email,role:grantRole})}}>
      <label>Email <input type="email" required value={email} onChange={event=>setEmail(event.target.value)} data-testid="access-email" /></label>
      <label>Role <select value={grantRole} onChange={event=>setGrantRole(event.target.value)} data-testid="access-role"><option value="director">Director</option><option value="owner">Owner</option></select></label>
      <button type="submit" disabled={busy}>Add access</button>
    </form> : <p data-testid="access-read-only">Access list is read-only.</p>}
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
  </section>;
}

type OwnedTournament = {id:string;name:string};
type Person = { soleOwnerTournaments:OwnedTournament[]; userId:string|null; email:string; displayName?:string; providers:string[]; roles:string[]; fromServer:boolean; tournamentAccess:{tournamentId:string;name:string;role:string}[] };
type Invite = {email:string;scope:string;role:string;name:string;fromServer:boolean};
type People = {users:Person[];invites:Invite[]};
const label = (role:string)=>role.charAt(0).toUpperCase()+role.slice(1);
export function PeopleAccess({token,onClose,onChange}:{token:string;onClose:()=>void;onChange:()=>Promise<unknown>}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [data,setData]=useState<People>({users:[],invites:[]}),[loading,setLoading]=useState(true);
  const [email,setEmail]=useState(''),[role,setRole]=useState('creator');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[copyText,setCopyText]=useState('');
  useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close()},[]);
  useEffect(()=>{let active=true;void accessRequest<People>('/api/people',token).then(result=>{if(active){setData(result);setLoading(false)}}).catch(e=>{if(active){setError(e.message);setLoading(false)}});return()=>{active=false}},[token]);
  async function change(method:string,url:string,body?:unknown) {
    setBusy(true);setError('');setNotice('');
    try {
      const result=await accessRequest<{removed?:boolean;soleOwnerTournaments?:OwnedTournament[]}>(url,token,method,body);
      await onChange();
      setData(await accessRequest<People>('/api/people',token));setEmail('');setNotice(result.removed===false?'Not changed':result.soleOwnerTournaments?.length ? `Access removed. Admins will still manage: ${result.soleOwnerTournaments.map(item=>item.name).join(', ')}.` : 'Access updated');
    }catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  function removePerson(person:Person) {
    const names=person.soleOwnerTournaments.map(item=>item.name).join(', ');
    const ownership=names ? `${person.email} is the only owner of: ${names}. Admins will still manage them.\n\n` : '';
    if(window.confirm(`${ownership}Remove ${person.email} from all roles and tournaments? Sign-in history will be kept.`))void change('DELETE',`/api/people/${encodeURIComponent(person.userId!)}`);
  }
  async function copy(email:string) {
    const value=`You've been given access to KSM. Sign in at ${location.origin}/ with ${email}.`;
    try{await navigator.clipboard.writeText(value);setNotice('Invite message copied');setCopyText('')}catch(_){setCopyText(value);setNotice('Copy the invite message below')}
  }
  return <dialog ref={dialog} className="ksm-people-dialog" onCancel={onClose} aria-labelledby="people-title" data-testid="people-access">
    <div className="ksm-people-heading"><h2 id="people-title">People &amp; access</h2><button type="button" onClick={onClose} aria-label="Close People & access">Close</button></div>
    <p>Give people access with their sign-in email. KSM does not send email; copy an invite message to send yourself.</p>
    <form className="ksm-access-form" onSubmit={event=>{event.preventDefault();void change('POST','/api/people/roles',{email,role})}}>
      <label>Email <input type="email" value={email} required onChange={event=>setEmail(event.target.value)} data-testid="people-email" /></label>
      <label>Role <select value={role} onChange={event=>setRole(event.target.value)} data-testid="people-role"><option value="creator">Creator</option><option value="admin">Admin</option></select></label>
      <button type="submit" disabled={busy}>Give access</button>
    </form>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {copyText && <label>Invite message <textarea readOnly value={copyText} /></label>}
    {loading && <p role="status">Loading people…</p>}
    <h3>People</h3><div className="ksm-people-list">{data.users.map(person=><article key={person.userId||person.email} className="ksm-person" data-testid="person-row">
      <strong>{person.email}</strong>{person.displayName && <span>{person.displayName}</span>}
      {person.fromServer && <span>from server settings</span>}
      {!!person.providers.length && <span className="sub">Sign-in: {person.providers.map(provider=>provider==='auth0'?'Email':provider==='google-oauth2'?'Google':provider).join(', ')}</span>}
      <div className="ksm-person-roles">{person.roles.map(value=><span key={value}>{label(value)} {!person.fromServer && <button type="button" disabled={busy} aria-label={`Remove ${label(value)} from ${person.email}`} onClick={()=>{void change('DELETE','/api/people/roles',{userId:person.userId,role:value})}}>Remove</button>}</span>)}{!person.roles.length && <span>No global roles</span>}</div>
      {!!person.tournamentAccess.length && <ul>{person.tournamentAccess.map(item=><li key={item.tournamentId}>{label(item.role)} · <a href={`/t/${encodeURIComponent(item.tournamentId)}/setup`}>{item.name}</a></li>)}</ul>}
      {!person.fromServer && person.userId && <button type="button" className="secondary" disabled={busy} aria-label={`Remove ${person.email} from everything`} onClick={()=>removePerson(person)}>Remove from everything</button>}
    </article>)}</div>
    <h3>Pending invites</h3><div className="ksm-people-list">{data.invites.map(invite=><article className="ksm-person" key={`${invite.email}-${invite.scope}-${invite.role}`} data-testid="pending-invite">
      <strong>{invite.email}</strong><span>{label(invite.role)} · {invite.name}</span>{invite.fromServer && <span>from server settings</span>}
      <div className="actions"><button type="button" onClick={()=>{void copy(invite.email)}}>Copy invite message</button>
      {!invite.fromServer && invite.scope==='global' && <button type="button" disabled={busy} aria-label={`Remove ${label(invite.role)} invite for ${invite.email}`} onClick={()=>{void change('DELETE','/api/people/roles',{email:invite.email,role:invite.role})}}>Remove role</button>}</div>
    </article>)}</div>{!loading && !data.invites.length && <p>No pending invites.</p>}
  </dialog>;
}
