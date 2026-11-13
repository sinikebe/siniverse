import { APPS, CONTENT, depthState, parentNode, openSurface, keepSurface, closeSurface, montageState } from './model.mjs';

import { renderDepthArrival } from './depth-arrival.mjs';

export const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export function drawing(app, label = '') {
  if (app === 'finapp') return '<svg class="content-drawing financial-lines" viewBox="0 0 480 210" role="img" aria-label="' + escape(label || 'Deux trajectoires fictives à horizon commun') + '"><path class="drawing-axis" d="M20 182H460M20 190V20"/><path class="drawing-main" d="M20 175C110 175 100 140 190 140S270 75 330 85 390 38 460 28"/><path class="drawing-alternate" d="M20 175C110 175 100 160 190 158S275 125 330 133 405 85 460 80"/><text x="24" y="205">aujourd’hui</text><text x="388" y="205">10 ans</text></svg>';
  if (app === 'garapp') return '<svg class="content-drawing history-line" viewBox="0 0 480 210" role="img" aria-label="' + escape(label || 'Un historique fictif ponctué de trois interventions') + '"><path class="drawing-main" d="M24 112H456"/><circle cx="78" cy="112" r="14"/><circle class="history-selected" cx="240" cy="112" r="24"/><circle cx="402" cy="112" r="14"/><path class="drawing-axis" d="M240 138V175"/><text x="45" y="75">mars</text><text x="189" y="60">24 avril</text><text x="372" y="75">juin</text><text x="166" y="200">un repère retrouvé</text></svg>';
  return '<svg class="content-drawing video-chain" viewBox="0 0 480 210" role="img" aria-label="' + escape(label || 'Une source, une sortie, un câble et un écran') + '"><path class="drawing-main" d="M100 100H380"/><rect x="22" y="48" width="90" height="106" rx="8"/><rect x="365" y="42" width="94" height="96" rx="5"/><path class="drawing-axis" d="M412 139V164M386 164H438"/><circle cx="112" cy="100" r="10"/><circle cx="365" cy="100" r="10"/><text x="22" y="194">source</text><text x="188" y="81">câble</text><text x="372" y="194">écran</text></svg>';
}
export function facts(content) {
  return content?.facts?.length ? '<dl class="content-facts">' + content.facts.map(item => '<div><dt>' + escape(item.label) + '</dt><dd>' + escape(item.value) + '</dd></div>').join('') + '</dl>' : '';
}
export function paragraphs(content) {
  return (content?.body || []).map(text => '<p>' + escape(text) + '</p>').join('');
}
function depthLink(api, node, label, className, extra = '') {
  return api.link(depthState(node), label, 'class="' + className + '" data-region="' + node + '" ' + extra);
}
function depthInterior(app, api) {
  const target = (part, body, label) => depthLink(api, app + '.' + part, body, 'depth-landmark landmark-' + part,
    'tabindex="0" aria-label="' + label + '"');
  const text = (x, y, title, subtitle) => '<text x="' + x + '" y="' + y + '" class="landmark-title">' + title + '</text><text x="' + x + '" y="' + (y + 23) + '" class="landmark-note">' + subtitle + ' ↘</text>';
  let drawing;
  if (app === 'finapp') {
    drawing = target('role', '<path class="landmark-fill" d="M80 260C200 270 220 160 350 160S490 60 630 50L630 170C510 165 480 225 350 225S210 275 80 260Z"/>' + text(265,112,'L’écart','Ce que compare Finapp'), 'Entrer dans l’écart : le rôle de Finapp')
      + '<path class="terrain-line" d="M80 260C200 270 220 160 350 160S490 60 630 50M80 260C210 275 220 225 350 225S510 165 630 170"/>'
      + target('exemple', '<path class="landmark-axis" d="M645 30V290"/><circle class="landmark-disc" cx="645" cy="285" r="20"/><text x="645" y="290" class="landmark-symbol">↘</text>' + text(480,332,'Un même horizon','Entrer dans l’exemple à dix ans'), 'Entrer dans l’horizon : exemple fictif de Finapp')
      + target('methode', '<circle class="landmark-start" cx="80" cy="260" r="28"/><path class="landmark-tick" d="M65 260H95M80 245V275"/>' + text(24,332,'Le point de départ','Poser les hypothèses'), 'Entrer dans les hypothèses : méthode de Finapp');
  } else if (app === 'garapp') {
    drawing = '<path class="terrain-line" d="M55 210H675"/>'
      + target('role', '<circle class="landmark-start" cx="95" cy="210" r="27"/>' + text(35,125,'Garder le fil','Le rôle de l’historique'), 'Entrer dans l’historique : le rôle de Garapp')
      + target('exemple', '<path class="landmark-tick" d="M355 212V130"/><circle class="landmark-disc" cx="355" cy="210" r="34"/><text x="355" y="216" class="landmark-symbol">↘</text>' + text(257,80,'24 avril 2026','Ouvrir ce repère'), 'Entrer dans le repère du 24 avril : historique fictif')
      + target('methode', '<path class="landmark-paper" d="M545 235H665V330H545Z M635 235V263H665"/><path class="landmark-tick" d="M565 280H642M565 295H630"/><circle class="landmark-start" cx="605" cy="210" r="12"/>' + text(450,150,'Relier les traces','Dates, dépenses, documents'), 'Entrer dans les traces : méthode de Garapp');
  } else {
    drawing = '<path class="terrain-line" d="M150 175H550"/>'
      + target('role', '<rect class="landmark-paper" x="30" y="100" width="120" height="150" rx="4"/><path class="landmark-tick" d="M50 125H125M50 145H110"/><circle class="landmark-disc" cx="150" cy="175" r="12"/>' + text(27,306,'La source','Le rôle des éléments'), 'Entrer dans la source : rôle des éléments vidéo')
      + target('exemple', '<path class="landmark-cable" d="M180 175H520"/><path class="landmark-tick" d="M350 175V95"/><circle class="landmark-start" cx="350" cy="175" r="24"/>' + text(250,70,'La liaison','Suivre le signal'), 'Entrer dans la liaison : exemple vidéo')
      + target('methode', '<rect class="landmark-paper" x="550" y="95" width="140" height="115" rx="3"/><path class="landmark-tick" d="M620 212V242M587 242H653"/><circle class="landmark-disc" cx="550" cy="175" r="12"/>' + text(470,306,'Les limites','Consulter le périmètre et les sources'), 'Entrer dans les limites : sources et méthode de Branchlab');
  }
  let compact;
  if(app === 'finapp') compact =
    target('methode','<circle class="landmark-start" cx="75" cy="80" r="26"/><path class="landmark-tick" d="M62 80H88M75 67V93"/>' + text(122,66,'Les hypothèses','Le point de départ'),'Entrer dans les hypothèses : méthode de Finapp')
    + target('role','<path class="landmark-fill" d="M75 110C75 205 280 195 280 395L115 395C115 220 75 205 75 110Z"/>' + text(30,247,'L’écart','Ce que compare Finapp'),'Entrer dans l’écart : le rôle de Finapp')
    + '<path class="terrain-line" d="M75 110C75 205 280 195 280 395M75 110C75 205 115 220 115 395"/>'
    + target('exemple','<path class="landmark-axis" d="M38 413H315"/><circle class="landmark-disc" cx="280" cy="413" r="18"/><text x="280" y="419" class="landmark-symbol">↘</text>' + text(40,468,'Un même horizon','Un exemple à dix ans'),'Entrer dans l’horizon : exemple fictif de Finapp');
  else if(app === 'garapp') compact =
    '<path class="terrain-line" d="M70 65V445"/>'
    + target('role','<circle class="landmark-start" cx="70" cy="75" r="26"/>' + text(120,65,'Garder le fil','Le rôle de l’historique'),'Entrer dans l’historique : le rôle de Garapp')
    + target('exemple','<circle class="landmark-disc" cx="70" cy="250" r="32"/><text x="70" y="256" class="landmark-symbol">↘</text>' + text(126,239,'24 avril 2026','Ouvrir ce repère'),'Entrer dans le repère du 24 avril : historique fictif')
    + target('methode','<path class="landmark-paper" d="M30 385H110V475H30Z M90 385V408H110"/><path class="landmark-tick" d="M46 429H94M46 446H83"/>' + text(135,415,'Les traces','Dates et documents'),'Entrer dans les traces : méthode de Garapp');
  else compact =
    '<path class="terrain-line" d="M90 132V376"/>'
    + target('role','<rect class="landmark-paper" x="32" y="30" width="115" height="100" rx="5"/><path class="landmark-tick" d="M50 54H125M50 72H110"/><circle class="landmark-disc" cx="90" cy="132" r="11"/>' + text(177,72,'La source','Comprendre les rôles'),'Entrer dans la source : rôle des éléments vidéo')
    + target('exemple','<path class="landmark-cable" d="M90 160V338"/><circle class="landmark-start" cx="90" cy="250" r="25"/>' + text(152,240,'La liaison','Suivre le signal'),'Entrer dans la liaison : exemple vidéo')
    + target('methode','<rect class="landmark-paper" x="25" y="376" width="130" height="96" rx="4"/><path class="landmark-tick" d="M90 473V491M60 491H120"/><circle class="landmark-disc" cx="90" cy="376" r="11"/>' + text(178,419,'Les limites','Périmètre et sources'),'Entrer dans les limites : sources et méthode de Branchlab');
  return '<svg class="depth-terrain depth-terrain-wide terrain-' + app + '" viewBox="0 0 720 375" aria-label="Les régions à explorer dans ' + APPS[app].name + '">' + drawing + '</svg>'
    + '<svg class="depth-terrain depth-terrain-compact terrain-' + app + '" viewBox="0 0 360 520" aria-label="Les régions à explorer dans ' + APPS[app].name + '">' + compact + '</svg>';
}
export function renderDepth(state, api) {
  const node = state.node, content = CONTENT[node], app = content.app, parent = parentNode(node);
  const parentFragment = '<span class="parent-graphic" aria-hidden="true">' + drawing(app || 'finapp') + '</span>';
  const up = node === 'ensemble' ? '' : (node.includes('.') ? api.link(depthState(),
    '<span class="parent-graphic parent-ensemble-graphic" aria-hidden="true">' + drawing('finapp') + drawing('garapp') + drawing('branchlab') + '</span><span><small>Le cadre d’origine</small><strong>Ensemble</strong></span><span aria-hidden="true">↖</span>',
    'class="depth-grandparent"') : '') + api.link(depthState(parent),
    parentFragment + '<span><small>Ressortir vers</small><strong>' + escape(parent === 'ensemble' ? 'l’ensemble' : APPS[parent].name) + '</strong></span><span aria-hidden="true">↖</span>',
    'class="depth-parent" id="depth-up"');
  if (node === 'ensemble') return '<section class="depth-world depth-ensemble" data-depth="0">' + renderDepthArrival(api) + '</section>';
  if (!node.includes('.')) {
    return '<section class="depth-world depth-app app-' + app + '" data-depth="1">' + up
      + '<div class="depth-room"><div class="depth-app-intro"><p class="eyebrow">' + APPS[app].name + ' · ' + escape(content.eyebrow)
      + '</p><h1 id="view-title" tabindex="-1">' + escape(content.title) + '</h1><p>' + escape(content.body[0]) + '</p>' + api.appLink(app)
      + '</div><div class="depth-interior">' + depthInterior(app, api) + '</div><p class="scene-note">Entrez dans un élément pour en révéler le contenu. Le bord extérieur ramène à l’ensemble.</p></div></section>';
  }
  return '<section class="depth-world depth-detail app-' + app + '" data-depth="2">' + up
    + '<article class="depth-room detail-room"><div class="detail-heading"><p class="eyebrow">' + escape(content.eyebrow)
    + '</p><h1 id="view-title" tabindex="-1">' + escape(content.title) + '</h1></div><div class="detail-visual">' + drawing(app) + facts(content) + '</div>'
    + '<div class="detail-reading">' + paragraphs(content) + '<div class="detail-exits">' + api.appLink(app)
    + (content.related ? api.link(depthState(content.related.app), escape(content.related.label) + ' <span aria-hidden="true">↗</span>', 'class="context-link"') : '')
    + '</div></div></article></section>';
}
export function renderMontage(state, api) {
  const surfaces = state.panels.map(id => {
    const content = CONTENT[id], app = content.app, active = state.focus === id, kept = state.kept.includes(id);
    const source = state.origins[id], sourceName = source ? CONTENT[source].title : 'Ensemble';
    const link = (target, label, attrs = '') => api.link(openSurface(state, target, id), label, attrs + ' data-source="' + id + '"');
    const heading = id === 'ensemble'
      ? '<p class="eyebrow">SINIVERSE · LE MONTAGE PARALLÈLE</p><h1 id="' + (active ? 'view-title' : 'title-' + id) + '" tabindex="-1">Une question en ouvre une autre.</h1>'
      : '<p class="eyebrow">' + escape(content.eyebrow) + '</p><h2 id="' + (active ? 'view-title' : 'title-' + id.replaceAll('.', '-')) + '" tabindex="-1">' + escape(content.title) + '</h2>';
    const destinations = id === 'ensemble'
      ? Object.entries(APPS).map(([target, item]) => link(target, '<span>' + item.verb + '</span><strong>' + item.name + '</strong><span aria-hidden="true">↗</span>', 'class="montage-entry entry-' + target + '"')).join('')
      : !id.includes('.')
        ? ['role', 'methode', 'exemple'].map((target, index) => link(app + '.' + target,
          '<span>0' + (index + 1) + '</span><strong>' + (target === 'role' ? 'Son rôle' : target === 'methode' ? 'Sa méthode' : app === 'garapp' ? 'Un historique' : 'Un exemple') + '</strong><b aria-hidden="true">+</b>', 'class="montage-topic"')).join('')
        : '';
    const related = app ? Object.keys(APPS).filter(other => other !== app).map(other =>
      link(other, (app === 'finapp' && other === 'garapp' ? 'De la prévision à l’historique' : APPS[other].verb + ' avec ' + APPS[other].name) + ' <span aria-hidden="true">↗</span>', 'class="montage-related"')).join('') : '';
    return '<article class="montage-surface ' + (app ? 'app-' + app : 'surface-ensemble') + (active ? ' is-active' : '') + (kept ? ' is-kept' : '')
      + '" data-surface="' + id + '" aria-label="' + escape(id === 'ensemble' ? 'Ensemble' : APPS[app].name + (id.includes('.') ? ' · ' + content.eyebrow.toLowerCase() : ''))
      + '"><div class="surface-origin"><span class="surface-thread" aria-hidden="true"></span><span>' + (source ? 'Ouvert depuis ' : 'Point de départ · ')
      + (source ? api.link(openSurface(state, source, id), escape(sourceName) + ' <span aria-hidden="true">↖</span>', 'class="surface-source-link" data-source-return="' + source + '"') : escape(sourceName)) + '</span></div><div class="surface-tools">'
      + api.link(keepSurface(state, id), kept ? 'Conservé <span aria-hidden="true">◆</span>' : 'Conserver <span aria-hidden="true">◇</span>', 'class="keep-surface" data-kept="' + kept + '" data-keep="' + id + '"')
      + api.link(closeSurface(state, id), 'Replier <span aria-hidden="true">−</span>', 'class="close-surface" data-close="' + id + '"')
      + '</div><div class="surface-body">' + heading + (id === 'ensemble' ? paragraphs(content) : drawing(app) + paragraphs(content) + facts(content))
      + '<div class="surface-destinations">' + destinations + '</div>'
      + (app ? '<div class="surface-real">' + api.appLink(app) + '</div><div class="surface-connections"><p>Ouvrir à côté</p>' + related + '</div>' : '')
      + '</div></article>';
  }).join('');
  const edges = state.panels.map(id => api.link(montageState({ ...state, focus: id }),
    '<span>' + (id === 'ensemble' ? 'Ensemble' : APPS[CONTENT[id].app].name) + '</span><small>' + (id.includes('.') ? CONTENT[id].eyebrow.toLowerCase() : 'vue d’ensemble')
    + '</small>' + (state.kept.includes(id) ? '<b aria-label="Conservé">◆</b>' : ''), 'class="montage-edge' + (state.focus === id ? ' is-active' : '') + '" aria-current="' + (state.focus === id ? 'true' : 'false') + '"')).join('');
  return '<section class="montage-world" data-count="' + state.panels.length + '"><div class="montage-rail" aria-label="Surfaces ouvertes">' + edges
    + api.link(montageState(), 'Tout replier <span aria-hidden="true">↙</span>', 'class="fold-all" id="fold-all"') + '</div><div class="montage-surfaces">' + surfaces
    + '</div><p class="montage-note">Conservez jusqu’à deux vues ; une troisième accueille la suite. Les bords nommés gardent le contexte de chaque ouverture.</p></section>';
}
