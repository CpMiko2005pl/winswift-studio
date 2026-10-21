// SF Symbols → Lucide icon names (closest visual match). Unknown names fall back by trimming
// SF suffixes (.fill, .circle, …) and finally to a direct dotted→dashed lookup.
const SF_MAP = {
  'house': 'house', 'gear': 'settings', 'gearshape': 'settings', 'gearshape.2': 'settings-2',
  'person': 'user', 'person.2': 'users', 'person.3': 'users', 'person.crop.circle': 'circle-user-round', 'person.circle': 'circle-user',
  'person.badge.plus': 'user-plus', 'person.crop.square': 'square-user', 'figure.2': 'users',
  'star': 'star', 'heart': 'heart', 'plus': 'plus', 'minus': 'minus', 'xmark': 'x', 'checkmark': 'check',
  'xmark.circle': 'circle-x', 'checkmark.circle': 'circle-check', 'checkmark.square': 'square-check',
  'plus.circle': 'circle-plus', 'minus.circle': 'circle-minus', 'plus.square': 'square-plus', 'plus.app': 'square-plus',
  'trash': 'trash-2', 'trash.circle': 'trash-2', 'xmark.bin': 'trash', 'pencil': 'pencil', 'square.and.pencil': 'square-pen',
  'pencil.circle': 'pencil', 'magnifyingglass': 'search', 'bell': 'bell', 'bell.slash': 'bell-off', 'bell.badge': 'bell-dot',
  'envelope': 'mail', 'envelope.open': 'mail-open', 'phone': 'phone', 'message': 'message-circle', 'bubble.left': 'message-circle',
  'bubble.right': 'message-circle', 'bubble.left.and.bubble.right': 'messages-square', 'text.bubble': 'message-square-text',
  'quote.bubble': 'message-square-quote', 'camera': 'camera', 'photo': 'image', 'photo.on.rectangle': 'images', 'photo.stack': 'images',
  'calendar': 'calendar', 'calendar.badge.plus': 'calendar-plus', 'clock': 'clock', 'alarm': 'alarm-clock', 'timer': 'timer',
  'stopwatch': 'timer', 'hourglass': 'hourglass', 'map': 'map', 'mappin': 'map-pin', 'mappin.and.ellipse': 'map-pin',
  'location': 'navigation', 'location.north': 'navigation-2', 'safari': 'compass', 'scope': 'crosshair',
  'cart': 'shopping-cart', 'bag': 'shopping-bag', 'basket': 'shopping-basket', 'creditcard': 'credit-card', 'gift': 'gift',
  'tag': 'tag', 'bookmark': 'bookmark', 'book': 'book-open', 'books.vertical': 'library', 'book.closed': 'book',
  'folder': 'folder', 'doc': 'file', 'doc.text': 'file-text', 'doc.on.doc': 'copy', 'clipboard': 'clipboard', 'note.text': 'notebook',
  'list.clipboard': 'clipboard-list', 'checklist': 'list-checks', 'paperplane': 'send', 'link': 'link', 'paperclip': 'paperclip',
  'square.and.arrow.up': 'share', 'square.and.arrow.down': 'download', 'arrow.down.circle': 'circle-arrow-down',
  'arrow.up': 'arrow-up', 'arrow.down': 'arrow-down', 'arrow.left': 'arrow-left', 'arrow.right': 'arrow-right',
  'arrow.up.circle': 'circle-arrow-up', 'arrow.right.circle': 'circle-arrow-right', 'arrow.left.circle': 'circle-arrow-left',
  'arrow.clockwise': 'rotate-cw', 'arrow.counterclockwise': 'rotate-ccw', 'arrow.triangle.2.circlepath': 'refresh-cw',
  'arrow.up.arrow.down': 'arrow-up-down', 'arrow.left.arrow.right': 'arrow-left-right', 'arrow.up.right.square': 'square-arrow-out-up-right',
  'arrow.uturn.backward': 'undo-2', 'arrow.uturn.forward': 'redo-2', 'shuffle': 'shuffle', 'repeat': 'repeat',
  'chevron.left': 'chevron-left', 'chevron.right': 'chevron-right', 'chevron.up': 'chevron-up', 'chevron.down': 'chevron-down',
  'chevron.left.forwardslash.chevron.right': 'code', 'ellipsis': 'ellipsis', 'ellipsis.circle': 'circle-ellipsis',
  'info': 'info', 'info.circle': 'info', 'exclamationmark.triangle': 'triangle-alert', 'exclamationmark.circle': 'circle-alert',
  'exclamationmark': 'circle-alert', 'questionmark': 'circle-help', 'questionmark.circle': 'circle-help',
  'lock': 'lock', 'lock.open': 'lock-open', 'key': 'key', 'shield': 'shield', 'checkmark.shield': 'shield-check',
  'globe': 'globe', 'wifi': 'wifi', 'antenna.radiowaves.left.and.right': 'radio', 'battery.100': 'battery-full', 'battery.25': 'battery-low',
  'sun.max': 'sun', 'sun.min': 'sun-dim', 'moon': 'moon', 'moon.stars': 'moon-star', 'cloud': 'cloud', 'cloud.rain': 'cloud-rain',
  'cloud.sun': 'cloud-sun', 'cloud.bolt': 'cloud-lightning', 'cloud.snow': 'cloud-snow', 'snowflake': 'snowflake', 'wind': 'wind',
  'thermometer': 'thermometer', 'thermometer.sun': 'thermometer-sun', 'umbrella': 'umbrella', 'beach.umbrella': 'umbrella',
  'flame': 'flame', 'bolt': 'zap', 'drop': 'droplet', 'leaf': 'leaf', 'tree': 'tree-pine', 'mountain.2': 'mountain',
  'play': 'play', 'pause': 'pause', 'stop': 'square', 'forward': 'fast-forward', 'backward': 'rewind',
  'forward.end': 'skip-forward', 'backward.end': 'skip-back', 'play.circle': 'circle-play', 'pause.circle': 'circle-pause',
  'music.note': 'music', 'music.note.list': 'list-music', 'mic': 'mic', 'mic.slash': 'mic-off', 'speaker.wave.2': 'volume-2',
  'speaker.wave.3': 'volume-2', 'speaker.slash': 'volume-x', 'speaker': 'volume', 'headphones': 'headphones', 'waveform': 'audio-waveform',
  'list.bullet': 'list', 'list.number': 'list-ordered', 'list.dash': 'list', 'square.grid.2x2': 'layout-grid', 'square.grid.3x3': 'grid-3x3',
  'rectangle.grid.2x2': 'layout-grid', 'line.3.horizontal': 'menu', 'line.3.horizontal.decrease': 'list-filter',
  'line.3.horizontal.decrease.circle': 'list-filter', 'slider.horizontal.3': 'sliders-horizontal', 'slider.vertical.3': 'sliders-vertical',
  'gamecontroller': 'gamepad-2', 'cup.and.saucer': 'coffee', 'fork.knife': 'utensils', 'wineglass': 'wine', 'birthday.cake': 'cake',
  'car': 'car', 'bus': 'bus', 'tram': 'tram-front', 'airplane': 'plane', 'bicycle': 'bike', 'figure.walk': 'footprints',
  'figure.run': 'activity', 'figure.wave': 'hand', 'heart.text.square': 'heart-pulse', 'bolt.heart': 'heart-pulse', 'cross': 'cross',
  'pills': 'pill', 'stethoscope': 'stethoscope', 'graduationcap': 'graduation-cap', 'briefcase': 'briefcase', 'building.2': 'building-2',
  'building.columns': 'landmark', 'storefront': 'store', 'house.lodge': 'house', 'hammer': 'hammer', 'wrench': 'wrench',
  'wrench.and.screwdriver': 'wrench', 'screwdriver': 'screwdriver', 'paintbrush': 'paintbrush', 'paintpalette': 'palette',
  'pencil.and.ruler': 'pencil-ruler', 'ruler': 'ruler', 'scissors': 'scissors', 'eye': 'eye', 'eye.slash': 'eye-off',
  'hand.thumbsup': 'thumbs-up', 'hand.thumbsdown': 'thumbs-down', 'hand.wave': 'hand', 'hand.raised': 'hand', 'hand.tap': 'pointer',
  'face.smiling': 'smile', 'face.dashed': 'smile', 'sparkles': 'sparkles', 'sparkle': 'sparkle', 'wand.and.stars': 'wand-sparkles',
  'trophy': 'trophy', 'crown': 'crown', 'medal': 'medal', 'rosette': 'award', 'flag': 'flag', 'flag.checkered': 'flag',
  'pin': 'pin', 'printer': 'printer', 'tv': 'tv', 'desktopcomputer': 'monitor', 'laptopcomputer': 'laptop', 'iphone': 'smartphone',
  'ipad': 'tablet', 'applewatch': 'watch', 'keyboard': 'keyboard', 'cpu': 'cpu', 'memorychip': 'memory-stick', 'externaldrive': 'hard-drive',
  'server.rack': 'server', 'chart.bar': 'chart-column', 'chart.bar.xaxis': 'chart-column', 'chart.pie': 'chart-pie',
  'chart.line.uptrend.xyaxis': 'trending-up', 'chart.xyaxis.line': 'chart-line', 'dollarsign': 'dollar-sign', 'dollarsign.circle': 'circle-dollar-sign',
  'eurosign': 'euro', 'banknote': 'banknote', 'square': 'square', 'circle': 'circle', 'triangle': 'triangle', 'diamond': 'diamond',
  'hexagon': 'hexagon', 'rectangle': 'rectangle-horizontal', 'capsule': 'pill', 'power': 'power', 'qrcode': 'qr-code', 'barcode': 'barcode',
  'cube': 'box', 'cube.box': 'box', 'shippingbox': 'package', 'tray': 'inbox', 'tray.full': 'inbox', 'archivebox': 'archive',
  'newspaper': 'newspaper', 'film': 'film', 'video': 'video', 'video.slash': 'video-off', 'lightbulb': 'lightbulb', 'brain': 'brain',
  'brain.head.profile': 'brain', 'atom': 'atom', 'dice': 'dices', 'die.face.5': 'dice-5', 'puzzlepiece': 'puzzle', 'pawprint': 'paw-print',
  'tortoise': 'turtle', 'hare': 'rabbit', 'ant': 'bug', 'ladybug': 'bug', 'fish': 'fish', 'bird': 'bird', 'cat': 'cat', 'dog': 'dog',
  'at': 'at-sign', 'number': 'hash', 'textformat': 'type', 'bold': 'bold', 'italic': 'italic', 'underline': 'underline',
  'text.alignleft': 'align-left', 'text.aligncenter': 'align-center', 'text.alignright': 'align-right', 'paragraphsign': 'pilcrow',
  'square.and.arrow.up.on.square': 'share-2', 'rectangle.portrait.and.arrow.right': 'log-out', 'arrow.right.square': 'log-in',
  'person.fill.checkmark': 'user-check', 'heart.slash': 'heart-off', 'star.slash': 'star-off', 'bookmark.slash': 'bookmark-x',
  'icloud': 'cloud', 'icloud.and.arrow.up': 'cloud-upload', 'icloud.and.arrow.down': 'cloud-download', 'network': 'network',
  'sun.horizon': 'sunrise', 'sunrise': 'sunrise', 'sunset': 'sunset', 'tornado': 'tornado', 'hurricane': 'tornado',
  'carrot': 'carrot', 'takeoutbag.and.cup.and.straw': 'cup-soda', 'mug': 'coffee', 'popcorn': 'popcorn',
  'soccerball': 'circle-dot', 'basketball': 'circle-dot', 'football': 'circle-dot', 'tennisball': 'circle-dot', 'dumbbell': 'dumbbell',
  'gauge': 'gauge', 'speedometer': 'gauge', 'checkmark.seal': 'badge-check', 'seal': 'badge', 'percent': 'percent',
  'plusminus': 'diff', 'function': 'sigma', 'sum': 'sigma', 'divide': 'divide', 'equal': 'equal', 'multiply': 'x',
  'house.circle': 'house', 'location.circle': 'navigation', 'map.circle': 'map', 'camera.circle': 'camera', 'sos': 'siren',
};

function sfSymbolToLucide(name, available) {
  const has = n => available && available.has(n);
  const tryName = n => {
    if (SF_MAP[n] && has(SF_MAP[n])) return SF_MAP[n];
    const dashed = n.replace(/\./g, '-');
    if (has(dashed)) return dashed;
    return null;
  };
  let n = name;
  let r = tryName(n);
  if (r) return r;
  // strip SF variant suffixes progressively
  const suffix = /\.(fill|circle|square|rectangle|slash|badge\.[a-z]+|inverse|2|3|left|right|up|down|forward|backward)$/;
  while (suffix.test(n)) {
    n = n.replace(suffix, '');
    r = tryName(n);
    if (r) return r;
  }
  const first = name.split('.')[0];
  return tryName(first) || 'circle-dashed';
}
