import { responsiveFontSize } from './responsiveTypography';
import React, { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { achievementShareText, renderAchievementCard } from './achievementShare';

export async function shareAchievementImage(card, image) {
  const text = achievementShareText(card);
  if (Capacitor.isNativePlatform()) {
    // Reuse one app-private cache file, never a backup or public storage path.
    const result = await Filesystem.writeFile({ path: 'kelani-achievement.png', data: image.split(',')[1], directory: Directory.Cache });
    await Share.share({ title: card.title, text, files: [result.uri], dialogTitle: card.title });
    return 'shared';
  }
  const binary = atob(image.split(',')[1]);
  const file = new File([Uint8Array.from(binary, c => c.charCodeAt(0))], 'kelani-achievement.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    await navigator.share({ title: card.title, text, files: [file] });
    return 'shared';
  }
  const link = document.createElement('a');
  link.href = image;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  return 'saved';
}

export default function AchievementShareModal({ card, t, onClose, Modal, buttonStyle }) {
  const dialogRef = useRef(null);
  const [image, setImage] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setImage('');
    renderAchievementCard(card).then(value => { if (active) setImage(value); })
      .catch(() => { if (active) setError(t.shareImageError); });
    return () => { active = false; };
  }, [card, t]);
  useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  async function share() {
    setError(''); setNotice(''); setBusy(true);
    try {
      const result = await shareAchievementImage(card, image);
      if (result === 'saved') setNotice(t.shareImageSaved);
    } catch (err) {
      if (err?.name !== 'AbortError' && !/cancel|dismiss/i.test(err?.message || '')) setError(t.shareError);
    } finally { setBusy(false); }
  }
  return <Modal title={t.sharePreviewTitle} onClose={onClose} zIndex={750}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={t.sharePreviewTitle} tabIndex={-1}
      style={{ outline: 'none', textAlign: 'center' }} onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
        if (event.key === 'Tab') {
          const controls = [...dialogRef.current.querySelectorAll('a[href], button:not(:disabled)')];
          const first = controls[0]; const last = controls[controls.length - 1];
          if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
    <p style={{ fontSize: responsiveFontSize(14), lineHeight: 1.4, margin: '0 0 12px' }}>{t.sharePrivacyHint}</p>
    {image ? <div style={{ border: '1px solid #8a623f', borderRadius: 8, background: '#000', overflow: 'hidden' }}><img src={image} alt={t.sharePreviewAlt} style={{ display: 'block', width: '100%', height: 'auto' }} /></div>
      : !error && <p role="status">{t.sharePreparing}</p>}
    <p style={{ fontSize: responsiveFontSize(14), margin: '14px 0' }}><a href={card.url} target="_blank" rel="noopener noreferrer" style={{ color: '#ff8a3d', fontWeight: 700 }}>{card.downloadLabel}</a></p>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, maxWidth: 328, margin: '0 auto' }}>
      <button type="button" disabled={!image || busy} onClick={share} style={{ ...buttonStyle('secondary', '0'), width: '100%', minWidth: 0, maxWidth: 160 }}>{t.shareAction}</button>
      <button type="button" onClick={onClose} style={{ ...buttonStyle('secondary', '0'), width: '100%', minWidth: 0, maxWidth: 160 }}>{t.close}</button>
    </div>
    {notice && <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center' }}><button type="button" style={buttonStyle('secondary', '0')} onClick={async () => {
      try { await navigator.clipboard.writeText(achievementShareText(card)); setNotice(t.shareLinkCopied); }
      catch { setError(t.shareCopyError); }
    }}>{t.shareCopyLink}</button></div>}
    </div>
  </Modal>;
}
