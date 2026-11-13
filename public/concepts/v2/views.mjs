import { APPS, CONTENT, depthState, parentNode, openSurface, keepSurface, closeSurface, montageState } from './model.mjs';

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
const viewName = id => 'depth-' + id.replaceAll('.', '-');
function depthLink(api, node, label, className, extra = '') {
  return api.link(depthState(node), label, 'class="' + className + '" data-region="' + node + '" ' + extra);
}
export function renderDepth(state, api) {
  const node = state.node, content = CONTENT[node], app = content.app, parent = parentNode(node);
  const up = node === 'ensemble' ? '' : api.link(depthState(parent),
    '<span aria-hidden="true">↖</span><span>Ressortir vers <strong>' + escape(parent === 'ensemble' ? 'l’ensemble' : APPS[parent].name) + '</strong></span>',
    'class="depth-parent" id="depth-up"');
  if (node === 'ensemble') return '<section class="depth-world depth-ensemble" data-depth="0"><div class="depth-room">'
    + '<div class="depth-intro"><p class="eyebrow">SINIVERSE · L’EMBOÎTEMENT</p><h1 id="view-title" tabindex="-1">Entrez dans ce qui<br>vous éclaire.</h1><p>Un outil, puis une question, puis ce qui l’explique.<br>Chaque région est un endroit à explorer.</p></div>'
    + '<div class="depth-regions">' + Object.entries(APPS).map(([id, item], index) => depthLink(api, id,
      '<span class="region-mark" aria-hidden="true">0' + (index + 1) + '</span><span class="region-copy"><span>' + item.verb + '</span><strong>' + item.name
      + '</strong><small>' + escape(CONTENT[id].title) + '</small><b>Entrer <span aria-hidden="true">↘</span></b></span>' + drawing(id), 'depth-region region-' + id)).join('')
    + '</div><p class="scene-note">Les destinations contiennent des explications et des exemples fictifs. Les applications s’ouvrent ensuite sur leur propre site.</p></div></section>';
  if (!node.includes('.')) {
    const descriptors = app === 'finapp'
      ? [['role', 'L’écart', 'Ce que compare Finapp'], ['exemple', 'L’horizon', 'Entrer dans un exemple à dix ans'], ['methode', 'Les hypothèses', 'Lire la méthode']]
      : app === 'garapp'
        ? [['exemple', '24 avril', 'Entrer dans un repère d’historique'], ['role', 'Les traces', 'Ce que conserve Garapp'], ['methode', 'Les liens', 'Dates, dépenses et documents']]
        : [['role', 'La source', 'Comprendre le rôle des éléments'], ['exemple', 'La liaison', 'Suivre la chaîne vidéo'], ['methode', 'Les sources', 'Lire le périmètre du diagnostic']];
    return '<section class="depth-world depth-app app-' + app + '" data-depth="1">' + up
      + '<div class="depth-room"><div class="depth-app-intro"><p class="eyebrow">' + APPS[app].name + ' · ' + escape(content.eyebrow)
      + '</p><h1 id="view-title" tabindex="-1">' + escape(content.title) + '</h1><p>' + escape(content.body[0]) + '</p>' + api.appLink(app)
      + '</div><div class="depth-interior">' + drawing(app)
      + descriptors.map(([id, label, note], index) => depthLink(api, app + '.' + id,
        '<span class="destination-numeral">0' + (index + 1) + '</span><strong>' + label + '</strong><span>' + note + ' <b aria-hidden="true">↘</b></span>',
        'depth-destination destination-' + index)).join('') + '</div><p class="scene-note">Entrez dans un élément pour en révéler le contenu. Le bord extérieur ramène à l’ensemble.</p></div></section>';
  }
  return '<section class="depth-world depth-detail app-' + app + '" data-depth="2">' + up
    + '<div class="depth-ancestor"><span>ENSEMBLE / ' + APPS[app].name.toUpperCase() + '</span></div>'
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
      + escape(sourceName) + '</span></div><div class="surface-tools">'
      + api.link(keepSurface(state, id), kept ? 'Conservé <span aria-hidden="true">◆</span>' : 'Conserver <span aria-hidden="true">◇</span>', 'class="keep-surface" aria-pressed="' + kept + '" data-keep="' + id + '"')
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
