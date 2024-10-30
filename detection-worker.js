importScripts(
  "fishy.js"
);

onmessage = function(event) {
  var resizes = event.data;
  var fishes = [];
  resizes.forEach(function(resize) {
    var detected = kittydar.detectInImageData(resize);
    fishes = fishes.concat(detected);
  });
    fishes = kittydar.combineOverlaps(fishes);
//  fishes = kittydar.combineOverlaps(fishes, 0.25, 2); //default

  postMessage({ type: 'result', fishes: fishes });
}

function postProgress(progress) {
  progress.type = 'progress'
  postMessage(progress);
}