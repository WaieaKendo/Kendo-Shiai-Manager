// The app's pop-up dialogs as React islands, with the same elements, classes, ids and test IDs as
// the legacy markup (the static dialogs of app/index.html and what the legacy code wrote into
// them), so the dialog CSS and every test apply unchanged; tests/golden/shell pins them:
// - Fusen-gachi: the contents of #fusenDialog (court screen);
// - the generation check: the contents of #validationModal;
// - Regenerate Single Division: the contents of #regenerateModal;
// - the cloud modal: #ksmCloudModal, a portal at the end of <body> (where openCloudModal()
//   appended it), with Tournament Access, Developer Tools or the Load Tournament File confirmation.
// The three static dialogs are the islands' roots; whether they are shown (their "hidden" class)
// is published too and set on the root by a layout effect, as classList.add / remove did.
//
// The legacy app decides what is shown and runs every action (app/js/44-react-shell.js publishes
// ksm:shell-dialogs): openFusenDialog() / closeFusenDialog(), showValidationDialog(),
// openRegenerateDivisionDialog(), continueRegenerateDivision(), regenerateSingleDivision(),
// closeManagementModal(), openTournamentAccess(), cloudDiagnostics(), confirmTournamentFileLoad()
// and closeCloudModal(). Every button calls what its inline handler called (Generate:
// ksmConfirmValidation(), what the legacy code assigned to its onclick), on the same click, before
// the document-wide listeners; a click on the cloud modal's backdrop (not inside it) closes it, as
// its click listener did. A redraw the legacy code did with innerHTML (or a new modal) draws new
// elements here (a new key per publish). Regenerate's radio buttons are uncontrolled:
// continueRegenerateDivision() reads the one chosen from the page.
// No colors or images of their own (the dialog CSS and theme tokens; the QR code is the address
// the legacy code built).
import { Fragment, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  CLOUD_TEXTS, DELETE_TEXTS, EMPTY_DIALOGS, FUSEN_TEXTS, REGENERATE_TEXTS, fusenSides, VALIDATION_TEXTS,
  deleteDevicesText, deleteEnabled, deleteRequiredName, regenerateOptionClass, regenerateStatusText,
  type CloudBody, type DeleteBody, type CloudDetail, type DialogsInput, type HistoryCourtView, type HistoryEntryView,
  type RegenerateContent, type SnapshotAnalysisView, type ValidationContent,
} from './dialogs-model.ts';
import { testToolsLabel } from './dialogs-model.ts';
import { rawStyle, shellWindow, subscribeTo } from './shell-dom.ts';

export const DIALOGS_EVENT = 'ksm:shell-dialogs';

const subscribe = subscribeTo(DIALOGS_EVENT);
const snapshot = (): DialogsInput => shellWindow().ksmShellDialogsInput ?? EMPTY_DIALOGS;
const useDialogs = () => useSyncExternalStore(subscribe, snapshot, () => EMPTY_DIALOGS);

/** The dialog root's "hidden" class, as the legacy classList.remove('hidden') / add('hidden'). */
function useShown(root: Element, open: boolean) {
  useLayoutEffect(() => { root.classList.toggle('hidden', !open); }, [root, open]);
}

const ACTIONS_STYLE = 'justify-content:flex-end;margin-top:18px;gap:10px;flex-wrap:wrap';
const WRAP_STYLE = 'overflow-wrap:anywhere';

// ------------------------------------------------------------------------------ Fusen-gachi

/** The contents of #fusenDialog. */
export function FusenDialog({ root }: { root: Element }) {
  const { fusen } = useDialogs();
  useShown(root, fusen.open);
  const w = shellWindow();
  return (
    <div className="ksm-modal-card">
      <h2 id="fusenTitle">{FUSEN_TEXTS.title}</h2>
      <p className="sub">{FUSEN_TEXTS.question}</p>
      <div className="fusen-sides">
        {fusenSides(fusen).map(b => (
          <button key={b.side} className={b.className} onClick={() => { w.confirmFusen?.(b.side); }} data-testid={b.testId}>
            <span className="fusen-side-label">{b.label}</span>
            {b.name && <span className="fusen-side-name">{b.name}</span>}
          </button>
        ))}
      </div>
      <div className="fusen-cancel-row">
        <button className="fusen-cancel" onClick={() => { w.closeFusenDialog?.(); }} data-testid="fusen-cancel">{FUSEN_TEXTS.cancel}</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------ generation check

function ValidationBody({ content }: { content: ValidationContent }) {
  if (content.valid) {
    return (
      <div className="muted-card"><b>{VALIDATION_TEXTS.noIssues}</b><div className="small" ref={rawStyle('margin-top:6px')}>{VALIDATION_TEXTS.question}</div></div>
    );
  }
  return (
    <div className="validation-list">
      {content.issues.map((x, i) => (
        <div key={i} className={`validation-issue ${x.severity}`}>
          <b>{x.division}</b>
          <div>{x.message}</div>
          {x.action ? <div className="small">{x.action}</div> : null}
        </div>
      ))}
    </div>
  );
}

function ValidationActions({ content }: { content: ValidationContent }) {
  const w = shellWindow();
  const close = () => { w.closeManagementModal?.('validationModal'); };
  if (!content.valid) return <button className="primary" onClick={close} data-testid="validation-close">{VALIDATION_TEXTS.close}</button>;
  return (
    <>
      <button onClick={close} data-testid="generate-cancel">{VALIDATION_TEXTS.cancel}</button>
      <button className="primary" id="validationGenerateConfirm" onClick={() => { w.ksmConfirmValidation?.(); }} data-testid="generate-confirm">{VALIDATION_TEXTS.generate}</button>
    </>
  );
}

/** The contents of #validationModal. */
export function ValidationDialog({ root }: { root: Element }) {
  const { validation } = useDialogs();
  useShown(root, validation.open);
  const content = validation.content;
  return (
    <div className="results-modal-card management-modal-card">
      <h2 id="validationModalTitle" className="validation-modal-title">{validation.title}</h2>
      <div id="validationModalBody">{content ? <ValidationBody key={validation.key} content={content} /> : null}</div>
      <div className="action-row validation-modal-actions" id="validationModalActions">{content ? <ValidationActions key={validation.key} content={content} /> : null}</div>
    </div>
  );
}

// ------------------------------------------------------------------------------ Regenerate

function RegenerateBody({ content }: { content: RegenerateContent }) {
  if (content.view === 'confirm') {
    return <div className="muted-card"><p>{REGENERATE_TEXTS.rebuild}</p><p><b>{REGENERATE_TEXTS.others}</b></p></div>;
  }
  if (content.view === 'done') {
    return (
      <div className="muted-card"><b>{`${content.division}${REGENERATE_TEXTS.done}`}</b><div className="small" ref={rawStyle('margin-top:6px')}>{REGENERATE_TEXTS.doneDetail}</div></div>
    );
  }
  return (
    <>
      <p className="sub">{REGENERATE_TEXTS.intro}</p>
      <div className="regenerate-list">
        {content.options.map((o, i) => (
          <label key={i} className={regenerateOptionClass(o.status)} data-testid="regenerate-option">
            <input type="radio" name="regenDiv" data-testid="regenerate-option-radio" value={o.name} defaultChecked={o.checked} disabled={o.status !== 'ready'} />
            <span><b data-testid="regenerate-option-name">{o.name}</b></span>
            <span className={`regenerate-status ${o.status}`} data-testid="regenerate-option-status">{regenerateStatusText(o.status)}</span>
          </label>
        ))}
      </div>
    </>
  );
}

function RegenerateActions({ content }: { content: RegenerateContent }) {
  const w = shellWindow();
  const close = () => { w.closeManagementModal?.('regenerateModal'); };
  if (content.view === 'done') return <button className="primary" onClick={close}>{REGENERATE_TEXTS.ok}</button>;
  return (
    <>
      <button onClick={close}>{REGENERATE_TEXTS.cancel}</button>
      {content.view === 'confirm'
        ? <button className="primary" onClick={() => { w.regenerateSingleDivision?.(content.division); }} data-testid="regenerate-confirm">{REGENERATE_TEXTS.regenerate}</button>
        : <button className="primary" onClick={() => { w.continueRegenerateDivision?.(); }} data-testid="regenerate-continue">{REGENERATE_TEXTS.continue}</button>}
    </>
  );
}

/** The contents of #regenerateModal. */
export function RegenerateDialog({ root }: { root: Element }) {
  const { regenerate } = useDialogs();
  useShown(root, regenerate.open);
  const content = regenerate.content;
  const w = shellWindow();
  return (
    <div className="results-modal-card management-modal-card">
      <div className="results-modal-head">
        <h2 id="regenerateModalTitle" data-testid="regenerate-modal-title">{regenerate.title}</h2>
        <button onClick={() => { w.closeManagementModal?.('regenerateModal'); }} aria-label={REGENERATE_TEXTS.closeLabel} data-testid="regenerate-modal-close">{REGENERATE_TEXTS.close}</button>
      </div>
      <div id="regenerateModalBody">{content ? <RegenerateBody key={regenerate.key} content={content} /> : null}</div>
      <div className="action-row" id="regenerateModalActions">{content ? <RegenerateActions key={regenerate.key} content={content} /> : null}</div>
    </div>
  );
}

// ------------------------------------------------------------------------------ cloud modal

function DetailGrid({ details }: { details: CloudDetail[] }) {
  return (
    <div className="cloud-detail-grid">
      {details.map((d, i) => (
        <div key={i} className="cloud-detail"><div className="small">{d.label}</div><b ref={rawStyle(WRAP_STYLE)} data-testid={d.testId}>{d.value}</b></div>
      ))}
    </div>
  );
}

/** snapshotAnalysisHtml(analysis). */
function SnapshotAnalysis({ analysis }: { analysis: SnapshotAnalysisView | null }) {
  if (!analysis) return <p className="small">{CLOUD_TEXTS.noAnalysis}</p>;
  return (
    <>
      <div className="cloud-detail-grid">
        <div className="cloud-detail"><div className="small">{CLOUD_TEXTS.total}</div><b>{analysis.total}</b></div>
        <div className="cloud-detail"><div className="small">{CLOUD_TEXTS.analyzed}</div><b>{analysis.analyzed}</b></div>
      </div>
      <h3 ref={rawStyle('margin-top:18px')}>{CLOUD_TEXTS.breakdown}</h3>
      <div className="cloud-detail-grid">
        {analysis.breakdown.map((x, i) => (
          <div key={i} className="cloud-detail"><div className="small">{x.label}</div><b>{x.value}</b><div className="small">{x.summary}</div></div>
        ))}
      </div>
      <h3 ref={rawStyle('margin-top:18px')}>{CLOUD_TEXTS.largestPaths}</h3>
      <div className="cloud-detail-grid">
        {analysis.largest.map((x, i) => (
          <div key={i} className="cloud-detail"><div className="small" ref={rawStyle(WRAP_STYLE)}>{x.label}</div><b>{x.value}</b><div className="small">{x.summary}</div></div>
        ))}
      </div>
    </>
  );
}

/** historyEntryCard(title, item). */
function HistoryEntryCard({ card }: { card: HistoryEntryView }) {
  if (!card.entry) return <div className="cloud-detail"><div className="small">{card.title}</div><b>{CLOUD_TEXTS.noEntry}</b></div>;
  return (
    <div className="cloud-detail"><div className="small">{card.entry.heading}</div><b>{card.entry.line}</b><div className="small" ref={rawStyle(WRAP_STYLE)}>{card.entry.changes}</div></div>
  );
}

/** actionHistoryAnalysisHtml(analysis): a heading and a grid per court. */
function HistoryAnalysis({ courts }: { courts: HistoryCourtView[] }) {
  return (
    <>
      {courts.map(c => (
        <Fragment key={c.court}>
          <h3 ref={rawStyle('margin-top:18px')}>{`Court ${c.court}`}</h3>
          <div className="cloud-detail-grid">
            <div className="cloud-detail"><div className="small">{CLOUD_TEXTS.entries}</div><b>{c.entries}</b></div>
            <div className="cloud-detail"><div className="small">{CLOUD_TEXTS.totalHistory}</div><b>{c.total}</b></div>
            <div className="cloud-detail"><div className="small">{CLOUD_TEXTS.averageEntry}</div><b>{c.average}</b></div>
            <div className="cloud-detail"><div className="small">{CLOUD_TEXTS.largestEntry}</div><b>{c.largest}</b></div>
            {c.cards.map((card, i) => <HistoryEntryCard key={i} card={card} />)}
          </div>
        </Fragment>
      ))}
    </>
  );
}

/** Delete tournament (issue #26): the warning, the devices connected, a backup, and the name to type. */
function DeleteTournament({ body }: { body: DeleteBody }) {
  const w = shellWindow();
  const [typed, setTyped] = useState('');
  const required = deleteRequiredName(body.name);
  const enabled = deleteEnabled(body.name, typed, body.busy);
  return (
    <form
      onSubmit={e => { e.preventDefault(); if (enabled) w.ksmConfirmDeleteTournament?.(); }}
      data-testid="delete-dialog"
    >
      <p data-testid="delete-warning"><b>{DELETE_TEXTS.warning}</b></p>
      <p>{DELETE_TEXTS.disconnect}</p>
      <p data-testid="delete-devices" role="status">{deleteDevicesText(body.devices)}</p>
      <div className="row" ref={rawStyle('margin-top:12px')}>
        <button type="button" className="secondary" onClick={() => { w.manualSaveTournament?.(); }} data-testid="delete-backup">{DELETE_TEXTS.backup}</button>
      </div>
      <p className="small">{DELETE_TEXTS.backupHint}</p>
      <label className="small" htmlFor="deleteTournamentName" ref={rawStyle('display:block;margin-top:12px')}>{DELETE_TEXTS.label}</label>
      <p ref={rawStyle(WRAP_STYLE)}><b data-testid="delete-required-name">{required}</b></p>
      <input
        id="deleteTournamentName" type="text" autoFocus autoComplete="off" autoCapitalize="off" spellCheck={false}
        value={typed} onChange={e => { setTyped(e.target.value); }} disabled={body.busy} data-testid="delete-name-input"
        ref={rawStyle('width:100%;box-sizing:border-box')}
      />
      {body.error ? <p role="alert" data-testid="delete-error"><b>{body.error}</b></p> : null}
      <div className="row" ref={rawStyle(ACTIONS_STYLE)}>
        <button type="button" className="secondary" onClick={() => { w.closeCloudModal?.(); }} data-testid="delete-cancel">{DELETE_TEXTS.cancel}</button>
        <button type="submit" className="secondary danger" disabled={!enabled} data-testid="delete-confirm">{body.busy ? DELETE_TEXTS.deleting : DELETE_TEXTS.delete}</button>
      </div>
    </form>
  );
}

function CloudModalBody({ body }: { body: CloudBody }) {
  const w = shellWindow();
  if (body.kind === 'delete') return <DeleteTournament body={body} />;
  if (body.kind === 'access') {
    return (
      <>
        {body.canEditSlug && <p className="small">Short name: {body.slug || 'Not assigned'}</p>}
        <div className="access-link-box" data-testid="access-link">{body.link}</div>
        <div className="row" ref={rawStyle('margin-top:12px')}>
          <button onClick={() => { w.copyTextValue?.(body.copy, CLOUD_TEXTS.copied); }} data-testid="access-copy">{CLOUD_TEXTS.copyLink}</button>
        </div>
        <div className="access-qr"><img src={body.qr} alt={CLOUD_TEXTS.qrAlt} data-testid="access-qr" /><p className="small">{CLOUD_TEXTS.scan}</p></div>
      </>
    );
  }
  if (body.kind === 'diagnostics') {
    return (
      <>
        <DetailGrid details={body.details} />
        <h2 ref={rawStyle('margin-top:24px')}>{CLOUD_TEXTS.snapshotHeading}</h2>
        <SnapshotAnalysis analysis={body.analysis} />
        <h2 ref={rawStyle('margin-top:24px')}>{CLOUD_TEXTS.historyHeading}</h2>
        <p className="small">{CLOUD_TEXTS.readOnly}</p>
        <HistoryAnalysis courts={body.history} />
        <div className="row" ref={rawStyle(ACTIONS_STYLE)}>
          <button className="secondary" onClick={() => { w.downloadSnapshotAnalysis?.(); }}>{CLOUD_TEXTS.downloadAnalysis}</button>
          <button className="secondary" onClick={() => { w.downloadActionHistorySample?.(); }}>{CLOUD_TEXTS.downloadHistory}</button>
          {body.retry ? <button className="secondary" onClick={() => { w.retryQueuedCloudSave?.(); }} data-testid="diagnostics-retry">{CLOUD_TEXTS.retry}</button> : null}
          <button className="secondary" onClick={() => { w.ksmToggleTestTools?.(); }} data-testid="diagnostics-test-tools">{testToolsLabel(body.testTools)}</button>
          {body.canDelete ? <button className="secondary danger" onClick={() => { w.ksmOpenDeleteTournament?.(); }} data-testid="diagnostics-delete">{CLOUD_TEXTS.deleteTournament}</button> : null}
        </div>
      </>
    );
  }
  return (
    <>
      <DetailGrid details={body.details} />
      <p data-testid="file-load-message">{body.message}</p>
      <div className="row" ref={rawStyle(ACTIONS_STYLE)}>
        <button className="secondary" onClick={() => { w.closeCloudModal?.(); }} data-testid="file-load-cancel">{CLOUD_TEXTS.cancel}</button>
        {body.same
          ? <button className="primary" onClick={() => { w.replaceTournamentFromFile?.(); }} data-testid="file-load-replace">{CLOUD_TEXTS.replace}</button>
          : <button className="primary" onClick={() => { w.loadTournamentFileAsNew?.(); }} data-testid="file-load-new">{CLOUD_TEXTS.loadNew}</button>}
      </div>
    </>
  );
}

/** #ksmCloudModal, appended to <body> while open (a portal; a new one for each opening). */
export function CloudModal() {
  const { cloud } = useDialogs();
  if (!cloud) return null;
  const w = shellWindow();
  return createPortal(
    <div id="ksmCloudModal" className="cloud-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) w.closeCloudModal?.(); }}>
      <div className="cloud-modal" role="dialog" aria-modal="true" data-testid="cloud-modal">
        <div className="cloud-modal-head">
          <div><div className="setup-panel-eyebrow">{CLOUD_TEXTS.eyebrow}</div><h2 data-testid="cloud-modal-title">{cloud.title}</h2></div>
          <button className="secondary" onClick={() => { w.closeCloudModal?.(); }} data-testid="cloud-modal-close">{CLOUD_TEXTS.close}</button>
        </div>
        <CloudModalBody body={cloud.body} />
      </div>
    </div>,
    document.body,
    String(cloud.key),
  );
}
