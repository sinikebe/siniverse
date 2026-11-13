// Bifurcations: the chosen words remain the route, rather than a step indicator.
// All destinations come from the shared, validated story model.
export function renderStory(state, api) {
  const story = api.story;
  const escape = api.escape;
  const kinds = ['opening', 'branch', 'app', 'example', 'method'];
  const kind = kinds.includes(story.kind) ? story.kind : 'branch';
  const app = ['finapp', 'garapp', 'branchlab'].includes(story.app) ? story.app : null;
  const content = story.content || { body: [], facts: [] };
  const trail = Array.isArray(story.trail) ? story.trail : [];
  const choices = Array.isArray(story.choices) ? story.choices : [];
  const isCurrent = destination => JSON.stringify(destination?.trail || []) === JSON.stringify(state.trail || []);
  const past = trail.filter(entry => !isCurrent(entry.state));
  const appName = app ? (api.apps[app]?.name || app) : '';

  const words = past.map(entry =>
    '<li class="story-chosen-word">' +
      api.link(entry.state, escape(entry.label), 'class="story-word-link"') +
      '<span class="story-word-joint" aria-hidden="true"></span>' +
    '</li>'
  ).join('');

  const annotationTitle = content.title && content.title !== story.title ? content.title : '';
  const paragraphs = (Array.isArray(content.body) ? content.body : []).filter(paragraph => paragraph !== story.lead).map(paragraph =>
    '<p>' + escape(paragraph) + '</p>'
  ).join('');
  const facts = (Array.isArray(content.facts) ? content.facts : []).map(fact =>
    '<div class="story-fact"><dt>' + escape(fact.label) + '</dt><dd>' + escape(fact.value) + '</dd></div>'
  ).join('');

  const branches = choices.map((choice, index) => {
    const noteId = 'story-choice-note-' + index;
    const attributes = 'class="story-choice-link"' + (choice.note ? ' aria-describedby="' + noteId + '"' : '');
    return '<li class="story-branch">' +
      '<span class="story-branch-joint" aria-hidden="true"></span>' +
      api.link(choice.state, escape(choice.label), attributes) +
      (choice.note ? '<p class="story-choice-note" id="' + noteId + '">' + escape(choice.note) + '</p>' : '') +
    '</li>';
  }).join('');

  const hasContent = Boolean(annotationTitle || paragraphs || facts);
  const annotation = hasContent ?
    '<aside class="story-annotation" aria-label="Éclairer cette partie du récit">' +
      (content.eyebrow ? '<p class="story-annotation-kicker">' + escape(content.eyebrow) + '</p>' : '') +
      (annotationTitle ? '<h2>' + escape(annotationTitle) + '</h2>' : '') +
      '<div class="story-annotation-body">' + paragraphs + '</div>' +
      (facts ? '<dl class="story-facts">' + facts + '</dl>' : '') +
    '</aside>' : '';

  return '<section class="story-world story-kind-' + kind + (app ? ' story-app-' + app : '') + '" data-story-node="' + escape(story.nodeId || '') + '">' +
    '<div class="story-running-head"><span>Siniverse / les bifurcations</span><span>La suite vous appartient.</span></div>' +
    '<div class="story-course">' +
      (past.length ? '<nav class="story-backstory" aria-label="Réviser une bifurcation du récit"><p class="story-backstory-label">Vous êtes passé par ces mots. Reprenez-en un pour changer de chemin.</p><ol class="story-chosen-words">' + words + '</ol></nav>' : '<p class="story-first-line">Tout commence par une question.</p>') +
      '<div class="story-present">' +
        '<div class="story-stem" aria-hidden="true"><span></span></div>' +
        '<header class="story-current">' +
          (app ? '<p class="story-answer-name">' + escape(appName) + '<span aria-hidden="true"> est une piste.</span></p>' : '') +
          '<h1 id="view-title" tabindex="-1">' + escape(story.title || 'Quelle suite voulez-vous explorer ?') + '</h1>' +
          (story.lead ? '<p class="story-lead">' + escape(story.lead) + '</p>' : '') +
        '</header>' +
        (kind === 'opening' ? '<p class="story-known-tools">Vous connaissez déjà votre outil ? ' + ['finapp', 'garapp', 'branchlab'].map(id => api.link({concept:'bifurcations',trail:[id]}, api.apps[id].name, 'class="story-direct-tool"')).join(' / ') + '</p>' : '') +
        annotation +
        (choices.length ? '<div class="story-next"><p class="story-next-label">' + (kind === 'opening' ? 'Commencez ici' : 'Et maintenant…') + '</p><ul class="story-branches">' + branches + '</ul></div>' : '') +
        (app ? '<div class="story-real-exit"><span class="story-exit-line" aria-hidden="true"></span><p>Passer du récit à votre propre projet.</p>' + api.appLink(app, 'Continuer dans ' + appName) + '</div>' : '') +
      '</div>' +
    '</div>' +
    '<p class="story-colophon"><span aria-hidden="true">↶</span> Une autre suite reste toujours possible.</p>' +
  '</section>';
}
