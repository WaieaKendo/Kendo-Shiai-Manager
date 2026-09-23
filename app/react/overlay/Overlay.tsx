// The stream overlay: a read-only lower third for one court (see overlay-model.ts).
import { useEffect, useState, type CSSProperties } from 'react';
import { useTournamentRecord, type LiveStatus } from '../live/useTournamentRecord.ts';
import { overlayLayout, overlayView, type OverlayParams, type OverlaySide, type Viewport } from './overlay-model.ts';

function readViewport(): Viewport {
  const type = screen.orientation?.type;
  const deviceLandscape = type ? type.startsWith('landscape') : screen.width > screen.height;
  return { width: window.innerWidth, height: window.innerHeight, deviceLandscape };
}

function useViewport(): Viewport {
  const [viewport, setViewport] = useState(readViewport);
  useEffect(() => {
    const update = (): void => setViewport(prev => {
      const next = readViewport();
      return next.width === prev.width && next.height === prev.height && next.deviceLandscape === prev.deviceLandscape ? prev : next;
    });
    window.addEventListener('resize', update);
    screen.orientation?.addEventListener('change', update);
    return () => {
      window.removeEventListener('resize', update);
      screen.orientation?.removeEventListener('change', update);
    };
  }, []);
  return viewport;
}

function SideBlock({ side, color, align }: { side: OverlaySide; color: 'white' | 'red'; align: 'left' | 'right' }) {
  return (
    <div className={`ov-side ov-${color} ov-align-${align}`} data-testid={`overlay-${color}`}>
      <div className="ov-stripe" />
      <div className="ov-who">
        <div className="ov-name" data-testid={`overlay-${color}-name`}>{side.name}</div>
        {side.sub ? <div className="ov-sub" data-testid={`overlay-${color}-sub`}>{side.sub}</div> : null}
      </div>
      <div className="ov-score">
        <span className="ov-points" data-testid={`overlay-${color}-points`}>{side.points.join(' ')}</span>
        <span className="ov-hansoku" data-testid={`overlay-${color}-hansoku`} data-count={side.hansoku} aria-label={`${side.hansoku} hansoku`}>
          {'▲'.repeat(Math.min(side.hansoku, 4))}
        </span>
      </div>
    </div>
  );
}

const STATUS_TEXT: Partial<Record<LiveStatus, string>> = {
  reconnecting: 'Reconnecting…',
  'not-found': 'Tournament not found',
  deleted: 'Tournament removed',
};

export function Overlay({ params }: { params: OverlayParams }) {
  const { record, status } = useTournamentRecord(params.tournament);
  const viewport = useViewport();
  const layout = overlayLayout(viewport, params);
  const view = overlayView(record?.payload?.state, params.court);

  const style = { '--u': `${layout.unit}px`, ...(layout.mode === 'band' ? { top: `${layout.y}%` } : {}) } as CSSProperties;
  const placement = layout.mode === 'band' ? 'ov-band' : `ov-${params.pos}`;
  const statusText = STATUS_TEXT[status];
  const loading = status === 'connecting' && !record;

  return (
    <>
      <div className={`ov-frame ${placement}`} style={style} data-testid="overlay" data-state={loading ? 'loading' : view.kind} data-mode={layout.mode} data-status={status}>
        {loading ? null : view.kind === 'match' ? (
          <>
            <div className="ov-bar" data-testid="overlay-bar">
              <div className="ov-court" data-testid="overlay-court">Court {view.court}</div>
              {params.red === 'left'
                ? <SideBlock side={view.red} color="red" align="left" />
                : <SideBlock side={view.white} color="white" align="left" />}
              <div className="ov-center">
                <div className="ov-division" data-testid="overlay-division">{view.division}</div>
                <div className="ov-meta" data-testid="overlay-meta">{view.meta}</div>
              </div>
              {params.red === 'left'
                ? <SideBlock side={view.white} color="white" align="right" />
                : <SideBlock side={view.red} color="red" align="right" />}
            </div>
            {view.next ? <div className="ov-next" data-testid="overlay-next"><b>Next:</b> {view.next}</div> : null}
          </>
        ) : (
          <div className="ov-bar ov-idle" data-testid="overlay-idle">
            <div className="ov-court" data-testid="overlay-court">Court {view.court}</div>
            <div className="ov-idle-text">
              {view.division ? <span className="ov-division" data-testid="overlay-division">{view.division}</span> : null}
              <span className="ov-meta">{statusText && status !== 'reconnecting' ? statusText : 'No active match'}</span>
            </div>
          </div>
        )}
        {status === 'reconnecting' ? <div className="ov-status" data-testid="overlay-status">{statusText}</div> : null}
      </div>
      {params.debug ? (
        <div className="ov-debug" data-testid="overlay-debug">
          {`${viewport.width}×${viewport.height} · page ${layout.pageOrientation} · device ${layout.deviceOrientation} · `}
          {layout.mode === 'band' ? `band y=${layout.y}%` : `normal ${params.pos}`}
          {` · unit ${layout.unit.toFixed(3)} · ${status}${record ? ` · rev ${record.revision}` : ''}`}
        </div>
      ) : null}
    </>
  );
}
