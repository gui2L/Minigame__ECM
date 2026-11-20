import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {mountGame} from './canvas.js';
import {createApi, jsonBody} from './api.js';
import './style.css';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8001';
const request = createApi(apiUrl);

function App() {
  const canvas = useRef(null);
  const game = useRef(null);
  const submittedRef = useRef(false);
  const [state, setState] = useState(null);
  const [gameMode, setGameMode] = useState('solo');
  const [speedMode, setSpeedMode] = useState('gradual');
  const [p1Name, setP1Name] = useState('Joueur 1');
  const [p2Name, setP2Name] = useState('Joueur 2');
  const [scores, setScores] = useState([]);
  const [matches, setMatches] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    game.current = mountGame(canvas.current, setState);
    return () => { game.current.destroy(); game.current = null; };
  }, []);

  async function loadScores(signal) {
    setLoading(true);
    try {
      const [scoreRes, matchRes] = await Promise.allSettled([
        request('/scores/', {signal}),
        request('/matches/', {signal}),
      ]);
      if (scoreRes.status === 'fulfilled') {
        setScores(scoreRes.value);
      }
      if (matchRes.status === 'fulfilled') {
        setMatches(matchRes.value);
      }
      if (scoreRes.status === 'rejected' && scoreRes.reason?.name !== 'AbortError') {
        setError(scoreRes.reason.message);
      } else if (matchRes.status === 'rejected' && matchRes.reason?.name !== 'AbortError') {
        setError(matchRes.reason.message);
      } else {
        setError('');
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    loadScores(controller.signal);
    return () => controller.abort();
  }, []);

  const isDuel = gameMode === '1v1' || state?.mode === '1v1';
  const finished = Boolean(state && state.status !== 'playing');
  const bestScore = scores.length > 0 ? scores[0] : null;
  const cleanP1 = p1Name.trim() || 'Joueur 1';
  const cleanP2 = p2Name.trim() || 'Joueur 2';

  useEffect(() => {
    if (game.current?.setPlayerNames) {
      game.current.setPlayerNames(cleanP1, cleanP2);
    }
  }, [cleanP1, cleanP2]);

  // 1. Sauvegarde automatique en mode solo
  useEffect(() => {
    if (!finished || isDuel || submittedRef.current) return;
    submittedRef.current = true;

    const finalPoints = state.score;
    const payload = {
      points: finalPoints,
      max_combo: state.maxCombo || 0,
      yellow_hits: state.yellowHits || 0,
      orange_hits: state.orangeHits || 0,
      red_hits: state.redHits || 0,
      white_hits: state.whiteHits || 0,
    };
    const isNewRecord = !bestScore || finalPoints > bestScore.points;

    async function autoSaveScore() {
      setSaving(true);
      setError('');
      setSaveMessage('Enregistrement du score…');
      try {
        const res = await request('/scores/', jsonBody('POST', payload));
        if (res) setScores([res]);
        if (isNewRecord && res && res.points === finalPoints) {
          setSaveMessage('Nouveau meilleur score enregistré !');
        } else {
          setSaveMessage('Score envoyé (meilleur score inchangé).');
        }
      } catch (err) {
        submittedRef.current = false;
        setSaveMessage('');
        setError(`Impossible d'enregistrer le score : ${err.message}`);
      } finally {
        setSaving(false);
      }
    }

    autoSaveScore();
  }, [finished, isDuel, state, bestScore]);

  // 2. Sauvegarde automatique en mode 1v1 dès qu'un joueur perd
  useEffect(() => {
    if (!finished || !isDuel || submittedRef.current) return;
    submittedRef.current = true;

    const winnerName = state.winner === 'left'
      ? cleanP1
      : state.winner === 'right'
        ? cleanP2
        : 'Égalité';

    const payload = {
      p1_name: cleanP1,
      p2_name: cleanP2,
      winner: state.winner || 'draw',
      winner_name: winnerName,
      p1_max_combo: state.left?.maxCombo || 0,
      p2_max_combo: state.right?.maxCombo || 0,
      p1_white_hits: state.left?.whiteHits || 0,
      p2_white_hits: state.right?.whiteHits || 0,
    };

    async function autoSaveMatch() {
      setSaving(true);
      setError('');
      setSaveMessage('Enregistrement du duel…');
      try {
        const saved = await request('/matches/', jsonBody('POST', payload));
        if (saved) {
          setMatches(prev => [saved, ...prev].slice(0, 10));
        }
        setSaveMessage(`Duel enregistré : victoire de ${winnerName} !`);
      } catch (err) {
        submittedRef.current = false;
        setSaveMessage('');
        setError(`Impossible d'enregistrer le duel : ${err.message}`);
      } finally {
        setSaving(false);
      }
    }

    autoSaveMatch();
  }, [finished, isDuel, state, cleanP1, cleanP2]);

  function commitPlayerName(side, rawValue) {
    const fallback = side === 'left' ? 'Joueur 1' : 'Joueur 2';
    const nextValue = rawValue.trim() || fallback;
    if (side === 'left') {
      setP1Name(nextValue);
    } else {
      setP2Name(nextValue);
    }
    canvas.current?.focus();
  }

  function toggleGameMode() {
    const nextMode = gameMode === 'solo' ? '1v1' : 'solo';
    submittedRef.current = false;
    setSaveMessage('');
    setError('');
    setGameMode(nextMode);
    if (nextMode === '1v1') {
      setSpeedMode('random');
    }
    if (game.current) {
      game.current.setGameMode(nextMode);
    }
  }

  function restart() {
    submittedRef.current = false;
    setSaveMessage('');
    setError('');
    game.current.restart();
  }

  function changeSpeedMode(mode) {
    const effectiveMode = isDuel ? 'random' : mode;
    setSpeedMode(effectiveMode);
    if (game.current) game.current.setSpeedMode(effectiveMode);
  }

  function formatStatus(currentState) {
    if (!currentState) return 'Chargement de la partie.';
    if (currentState.mode === '1v1') {
      if (currentState.status !== 'playing') {
        return currentState.winner === 'left'
          ? `Fin du duel : ${cleanP1} gagne !`
          : currentState.winner === 'right'
            ? `Fin du duel : ${cleanP2} gagne !`
            : 'Fin du duel : égalité !';
      }
      return `${cleanP1} (x${currentState.left.combo}) vs ${cleanP2} (x${currentState.right.combo}) · Équilibre : ${currentState.balance > 0 ? '+' : ''}${currentState.balance}`;
    }
    if (currentState.status !== 'playing') return `Partie terminée : ${currentState.score} points.`;
    /*switch (currentState.lastHit) {
      case 'white': return 'Blanc !';
      case 'red': return 'Rouge !';
      case 'orange': return 'Orange !';
      case 'yellow': return 'Jaune !';
      case 'miss': return 'Raté !';
      default: return '';
    }*/
  }

  return <main>
    <header className="game-header">
      <div>
        <p className="eyebrow">{isDuel ? 'ECM · DUEL LOCAL 1V1' : 'ECM · TIMING SOLO'}</p>
        <h1>TIME_IT</h1>
      </div>
      {state && !isDuel && (
        <div className="hud" aria-label="Statistiques">
          <span><small>Meilleur score</small><strong>{bestScore ? `${bestScore.points} pts` : '—'}</strong></span>
          <span><small>Meilleur combo</small><strong>{bestScore ? `x${bestScore.max_combo ?? 0}` : '—'}</strong></span>
          <span><small>Score</small><strong>{state.score}</strong></span>
          <span><small>Combo</small><strong>x{state.combo}</strong></span>
          <span><small>Vies</small><strong>{'♥'.repeat(Math.max(0, state.lives))}</strong></span>
        </div>
      )}
      {state && isDuel && state.left && state.right && (
        <div className="hud" aria-label="Statistiques 1v1">
          <span><small>Combo {cleanP1}</small><strong>x{state.left.combo}</strong></span>
          <span>
            <small>Avantage</small>
            <strong>
              {state.balance > 0
                ? `${cleanP1} +${state.balance}%`
                : state.balance < 0
                  ? `${cleanP2} +${Math.abs(state.balance)}%`
                  : 'Centre'}
            </strong>
          </span>
          <span><small>Combo {cleanP2}</small><strong>x{state.right.combo}</strong></span>
        </div>
      )}
    </header>

    <div className={isDuel ? 'game-layout duel-layout' : 'game-layout'}>
      <section aria-label="Le jeu">
        <div className="canvas-stage">
          <div className="canvas-wrapper">
            <canvas
              ref={canvas}
              width="640"
              height="400"
              tabIndex="0"
              aria-label={isDuel ? `Duel 1v1. Espace pour ${cleanP1}, Entrée pour ${cleanP2}.` : 'Jeu de timing circulaire. Espace pour tenter un appui.'}
            />
            {isDuel && (
              <>
                <input
                  type="text"
                  className="duel-name-input left"
                  value={p1Name}
                  maxLength={24}
                  aria-label="Nom du joueur de gauche"
                  title="Cliquez pour modifier le nom du Joueur 1"
                  onChange={e => setP1Name(e.target.value)}
                  onBlur={e => commitPlayerName('left', e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitPlayerName('left', e.currentTarget.value);
                    }
                  }}
                />
                <input
                  type="text"
                  className="duel-name-input right"
                  value={p2Name}
                  maxLength={24}
                  aria-label="Nom du joueur de droite"
                  title="Cliquez pour modifier le nom du Joueur 2"
                  onChange={e => setP2Name(e.target.value)}
                  onBlur={e => commitPlayerName('right', e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitPlayerName('right', e.currentTarget.value);
                    }
                  }}
                />
              </>
            )}
          </div>

          <button
            type="button"
            className="secondary mode-arrow"
            onClick={toggleGameMode}
            title={isDuel ? 'Revenir au mode Solo' : 'Passer en mode 1v1'}
            aria-label={isDuel ? 'Revenir au mode Solo' : 'Passer en mode 1v1'}>
            <span>{isDuel ? '←' : '→'}</span>
            <small>{isDuel ? 'Solo' : '1v1'}</small>
          </button>
        </div>

        <div className="controls">
          {!isDuel ? (
            <>
              <button
                type="button"
                className={speedMode === 'gradual' ? 'speed-switch active' : 'speed-switch'}
                aria-pressed={speedMode === 'gradual'}
                onClick={() => changeSpeedMode('gradual')}>
                Graduelle
              </button>
              <button
                type="button"
                className={speedMode === 'random' ? 'speed-switch active' : 'speed-switch'}
                aria-pressed={speedMode === 'random'}
                onClick={() => changeSpeedMode('random')}>
                Aléatoire
              </button>
            </>
          ) : (
            <button type="button" className="speed-switch active" disabled aria-pressed="true">
              Aléatoire uniquement
            </button>
          )}

          {!isDuel ? (
            <button
              className="hit-button"
              disabled={finished}
              onPointerDown={e => {e.currentTarget.setPointerCapture(e.pointerId); game.current.setInput('hit', true);}}
              onPointerUp={() => game.current.setInput('hit', false)}
              onPointerCancel={() => game.current.setInput('hit', false)}>
              Appuie
            </button>
          ) : (
            <>
              <button
                className="hit-button"
                disabled={finished}
                onPointerDown={e => {e.currentTarget.setPointerCapture(e.pointerId); game.current.setInput('leftHit', true);}}
                onPointerUp={() => game.current.setInput('leftHit', false)}
                onPointerCancel={() => game.current.setInput('leftHit', false)}>
                {cleanP1} (Espace)
              </button>
              <button
                className="hit-button"
                disabled={finished}
                onPointerDown={e => {e.currentTarget.setPointerCapture(e.pointerId); game.current.setInput('rightHit', true);}}
                onPointerUp={() => game.current.setInput('rightHit', false)}
                onPointerCancel={() => game.current.setInput('rightHit', false)}>
                {cleanP2} (Entrée)
              </button>
            </>
          )}

          <button className="secondary" onClick={() => game.current.pause()}>Pause</button>
          <button className="secondary" onClick={() => game.current.resume()}>Reprendre</button>
          <button className="secondary" onClick={restart}>Rejouer</button>
        </div>

        <p className="hint">
          {isDuel
            ? 'Cliquez sur un nom pour le modifier · Poussée : Jaune +2 · Orange +4 · Rouge +7 · Blanc +25 (Bonus +3 / 3 combos)'
            : 'Jaune 50 · Orange 100 · Rouge 150 · Blanc 450 · Espace pour appuyer'}
        </p>
        <p role="status">{formatStatus(state)}</p>
        {finished && saveMessage && <p className="save-status">{saveMessage}</p>}

        {isDuel && (
          <div className="duel-history" aria-label="Historique des duels">
            <div className="list-heading">
              <h2>Historique des <span>duels 1v1</span></h2>
              <button className="secondary" disabled={saving || loading} onClick={() => loadScores()}>
                Recharger
              </button>
            </div>
            {matches.length === 0 ? (
              <p className="empty">Aucun duel enregistré pour le moment.</p>
            ) : (
              <ul className="match-list">
                {matches.map(m => (
                  <li key={m.id} className="match-item">
                    <div>
                      <strong>{m.p1_name}</strong> vs <strong>{m.p2_name}</strong>
                      <span className="match-winner"> · Vainqueur : {m.winner_name}</span>
                    </div>
                    <small className="match-stats">
                      Combos max : x{m.p1_max_combo} / x{m.p2_max_combo} · Zones blanches : {m.p1_white_hits} / {m.p2_white_hits}
                    </small>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {!isDuel && (
        <aside aria-label="Classement">
          <div className="list-heading">
            <h2>Records <span>globaux</span></h2>
            <button className="secondary" disabled={saving || loading} onClick={() => loadScores()}>
              Recharger
            </button>
          </div>
          {loading ? (
            <p className="hint">Chargement…</p>
          ) : bestScore ? (
            <>
              <div className="record-grid">
                <div className="record-card">
                  <span className="record-label">Meilleur score</span>
                  <strong className="record-value">{bestScore.points} pts</strong>
                </div>
                <div className="record-card">
                  <span className="record-label">Meilleur combo</span>
                  <strong className="record-value">x{bestScore.max_combo ?? 0}</strong>
                </div>
              </div>
              <p className="hint">
                Touches du record : {bestScore.white_hits ?? 0} Blanc · {bestScore.red_hits ?? 0} Rouge · {bestScore.orange_hits ?? 0} Orange · {bestScore.yellow_hits ?? 0} Jaune
              </p>
            </>
          ) : (
            <p className="empty">Aucun score enregistré pour le moment.</p>
          )}
        </aside>
      )}
    </div>
    {error && <p role="alert" className="error">{error}</p>}
  </main>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);