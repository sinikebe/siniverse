// The overview is the navigable sheet itself, not a hero followed by a catalogue.
// Returns the interior of the existing .depth-world section.
export function renderDepthArrival(api) {
  const e = api.escape;
  const label = (x, y, value, className = 'arrival-note') => '<text x="' + x + '" y="' + y + '" class="' + className + '">' + e(value) + '</text>';
  const region = (id, shape, body) => {
    const name = api.apps[id].name;
    return api.link({ concept: 'emboitement', node: id }, '<path class="arrival-zone" d="' + shape + '"/>' + body,
      'class="depth-sheet-region arrival-' + id + '" data-region="' + id + '" tabindex="0" aria-label="Entrer dans ' + e(name) + ' : ' + e(api.detail(id)?.title || '') + '"');
  };
  const name = (id, x, y) => label(x, y, api.apps[id].name, 'arrival-app-name');
  const purpose = (id, x, y) => label(x, y, api.detail(id)?.title || '', 'arrival-purpose');
  const enter = (x, y) => label(x, y, 'Entrer dans cette question ↘', 'arrival-enter');

  const wide = region('finapp', 'M0 0H780C700 95 700 190 570 240S400 300 390 390H0Z',
    name('finapp', 48, 65) + purpose('finapp', 51, 96)
    + '<path class="arrival-guide" d="M80 302H557M80 308V145"/>'
    + '<path class="arrival-curve" d="M80 288C170 288 165 245 260 245S365 172 430 185 500 132 557 127"/>'
    + '<path class="arrival-curve arrival-alternate" d="M80 288C165 288 170 271 260 270S365 238 430 248 505 210 557 210"/>'
    + label(82, 325, 'aujourd’hui', 'arrival-measure') + label(508, 325, '10 ans', 'arrival-measure') + enter(48, 365))
    + region('garapp', 'M780 0H1200V420C1060 410 990 350 900 370S700 410 570 240C700 190 700 95 780 0Z',
      name('garapp', 803, 65) + purpose('garapp', 806, 96)
      + '<path class="arrival-curve" d="M735 210H1145"/>'
      + '<circle class="arrival-event" cx="780" cy="210" r="10"/><circle class="arrival-event arrival-event-selected" cx="950" cy="210" r="23"/><circle class="arrival-event" cx="1114" cy="210" r="10"/>'
      + label(757, 180, 'mars', 'arrival-measure') + label(916, 165, '24 avril', 'arrival-measure') + label(1092, 180, 'juin', 'arrival-measure')
      + '<path class="arrival-guide" d="M950 239V270"/>' + label(866, 293, 'Un repère retrouvé', 'arrival-note') + enter(899, 349))
    + region('branchlab', 'M0 390H390C400 300 440 290 570 240C700 410 810 390 900 370S1060 410 1200 420V680H0Z',
      name('branchlab', 403, 463) + purpose('branchlab', 406, 494)
      + '<path class="arrival-curve" d="M210 579H985"/>'
      + '<rect class="arrival-device" x="90" y="531" width="120" height="95" rx="5"/><path class="arrival-guide" d="M111 554H185M111 572H174"/>'
      + '<rect class="arrival-device" x="985" y="521" width="130" height="101" rx="4"/><path class="arrival-guide" d="M1050 623V646M1018 646H1082"/>'
      + '<circle class="arrival-port" cx="210" cy="579" r="10"/><circle class="arrival-port" cx="985" cy="579" r="10"/>'
      + label(126, 651, 'source', 'arrival-measure') + label(552, 562, 'câble', 'arrival-measure') + label(1028, 674, 'écran', 'arrival-measure') + enter(424, 641));

  const compact = region('finapp', 'M0 0H360V350C220 305 150 375 0 330Z',
    name('finapp', 27, 53) + purpose('finapp', 29, 81)
    + '<path class="arrival-guide" d="M38 257H322M38 263V126"/>'
    + '<path class="arrival-curve" d="M38 245C95 245 95 204 151 204S223 151 262 160 298 129 322 125"/>'
    + '<path class="arrival-curve arrival-alternate" d="M38 245C95 245 95 230 151 229S223 208 262 211 298 188 322 187"/>'
    + label(39, 279, 'aujourd’hui', 'arrival-measure') + label(273, 279, '10 ans', 'arrival-measure') + enter(27, 310))
    + region('garapp', 'M0 330C150 375 220 305 360 350V700C200 660 130 735 0 690Z',
      name('garapp', 27, 412) + purpose('garapp', 29, 440)
      + '<path class="arrival-curve" d="M38 541H322"/>'
      + '<circle class="arrival-event" cx="58" cy="541" r="9"/><circle class="arrival-event arrival-event-selected" cx="180" cy="541" r="23"/><circle class="arrival-event" cx="302" cy="541" r="9"/>'
      + label(41, 510, 'mars', 'arrival-measure') + label(150, 490, '24 avril', 'arrival-measure') + label(287, 510, 'juin', 'arrival-measure')
      + '<path class="arrival-guide" d="M180 568V603"/>' + label(113, 625, 'Un repère retrouvé', 'arrival-note') + enter(27, 668))
    + region('branchlab', 'M0 690C130 735 200 660 360 700V1050H0Z',
      name('branchlab', 27, 774) + purpose('branchlab', 29, 803)
      + '<path class="arrival-curve" d="M103 913H262"/>'
      + '<rect class="arrival-device" x="29" y="876" width="74" height="79" rx="4"/><path class="arrival-guide" d="M44 896H89M44 910H79"/>'
      + '<rect class="arrival-device" x="262" y="876" width="74" height="64" rx="3"/><path class="arrival-guide" d="M299 942V961M278 961H320"/>'
      + '<circle class="arrival-port" cx="103" cy="913" r="8"/><circle class="arrival-port" cx="262" cy="913" r="8"/>'
      + label(47, 984, 'source', 'arrival-measure') + label(160, 894, 'câble', 'arrival-measure') + label(280, 984, 'écran', 'arrival-measure') + enter(27, 1026));

  return '<div class="depth-room depth-arrival-room"><header class="depth-arrival-origin"><span class="arrival-origin-point" aria-hidden="true"></span><h1 id="view-title" tabindex="-1">siniverse.</h1><p>Entrez dans une question.</p></header>'
    + '<nav class="depth-arrival-landscape" aria-label="Entrer dans un outil">'
    + '<svg class="depth-arrival-wide" viewBox="0 0 1200 680" role="group" aria-label="Trois régions de contenu dans une même étendue">' + wide
    + '<path class="arrival-seam" d="M780 0C700 95 700 190 570 240S400 300 390 390H0M570 240C700 410 810 390 900 370S1060 410 1200 420"/></svg>'
    + '<svg class="depth-arrival-compact" viewBox="0 0 360 1050" role="group" aria-label="Trois régions de contenu à parcourir">' + compact
    + '<path class="arrival-seam" d="M0 330C150 375 220 305 360 350M0 690C130 735 200 660 360 700"/></svg>'
    + '</nav></div>';
}
