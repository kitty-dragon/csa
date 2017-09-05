#!/usr/bin/node

let fs = require('fs')

if (process.argv.length < 3) {
  console.log('Usage: ' + process.argv[1] + ' <folder1> [<folder2> ...]')
  process.exit(1)
}

let aliases = {}
let map_file = fs.readFileSync('aliases.txt', 'utf8')

map_file.split('\n').forEach(line => {
  let names = line.split(',')

  for (let i = 1; i < names.length; i++) {
    aliases[names[i]] = names[0]
  }
})

let GAME_THRESHOLD = 10

// everything that starts with "-" or is empty line is skipped
let COMMENT_RE = /^-|^$/;

// round marker, like ### Round 1 ###
let ROUND_RE   = /^#+\s+(.+?)\s+#+$/;

// 1. username - deck
// 1. username - deck (comment)
let DECK_RE    = /^\d+\.\s+(.+?)\s+-\s+([^()]+?)(?:\s+\(.*\))?$/;

// 1. username - 1-2 username
// 1. username - 0-2-1 username
let MATCH_RE   = /^\d+\.\s+(.+?)\s+-(?:\s+([012])-([012])(?:-[0123])?\s+(.+?))?$/;

let deck_stats = {}

function read_folder(folder) {
  let deck_file = fs.readFileSync(folder + '/decks.txt', 'utf8')
  let lines = deck_file.split('\n')
  let m

  let players = {}

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim()

    if (line.match(COMMENT_RE)) continue;

    m = line.match(DECK_RE)

    if (!m) throw 'Invalid line ' + String(i+1) + ': ' + line

    let [ , nick, deck ] = m

    deck = aliases[deck] || deck

    players[nick] = deck

    deck_stats[deck] = deck_stats[deck] || {
      name: deck,
      count: 0,
      win: 0,
      loss: 0,
      matchups: {}
    }

    deck_stats[deck].count++
  }

  let match_file = fs.readFileSync(folder + '/matches.txt', 'utf8')

  lines = match_file.split('\n')

  let i = 0;

  while (i < lines.length) {
    let line = lines[i].trim()

    if (line.match(COMMENT_RE)) continue;

    m = line.match(ROUND_RE)

    if (!m) throw 'Expected round start on line ' + String(i+1) + ': ' + line

    i++

    let results = {}

    for (; i < lines.length; i++) {
      let line = lines[i].trim()

      if (line.match(COMMENT_RE)) continue;
      if (line.match(ROUND_RE)) break;

      m = line.match(MATCH_RE)

      if (!m) throw 'Invalid line ' + String(i+1) + ': ' + line

      let [ , player1, win, loss, player2 ] = m

      if (!win && !loss && !player2) continue; // byes and such

      if (!players[player1]) throw 'Unknown player ' + player1 + ' on line ' + String(i+1) + ': ' + line
      if (!players[player2]) throw 'Unknown player ' + player2 + ' on line ' + String(i+1) + ': ' + line

      if (results[player1]) throw 'Results are already defined for player ' + player1

      results[player1] = { peer: player2, win: +win, loss: +loss }
    }

    for (let nick of Object.keys(results)) {
      let res1 = results[nick]
      let res2 = results[res1.peer]

      if (res1.win !== res2.loss || res1.loss !== res2.win) {
        throw 'Mismatching win record for players ' + res2.peer + ' and ' + res1.peer;
      }

      let deck = players[nick]

      deck_stats[deck].win  += res1.win
      deck_stats[deck].loss += res1.loss

      let peerdeck = players[res1.peer]

      deck_stats[deck].matchups[peerdeck] = deck_stats[deck].matchups[peerdeck] || {
        win: 0,
        loss: 0,
        name: peerdeck
      };

      deck_stats[deck].matchups[peerdeck].win  += res1.win
      deck_stats[deck].matchups[peerdeck].loss += res1.loss
    }
  }
}

process.argv.slice(2).forEach(file => read_folder(file))

function pad(str, n) { return ' '.repeat(Math.max(n - str.length, 0)); }

Object.keys(deck_stats)
    .map(deck => deck_stats[deck])
    .sort((deck1, deck2) => deck2.count - deck1.count)
    .forEach(deck => {

  let deck_count = String(deck.count) + ' ' + (deck.count === 1 ? 'deck' : 'decks')
  let win_pct = (deck.win / (deck.win + deck.loss) * 100).toFixed(2) + '%'
  console.log(deck.name + pad(deck.name, 20) + deck_count + pad(deck_count, 10) + win_pct + pad(win_pct, 6) + '  (' + deck.win + '-' + deck.loss + ')')
});

Object.keys(deck_stats)
    .map(deck => deck_stats[deck])
    .sort((deck1, deck2) => deck2.count - deck1.count)
    .forEach(deck => {

  let hdr_printed = false

  Object.keys(deck.matchups)
      .map(name => deck.matchups[name])
      .sort((ma1, ma2) => (ma2.win / (ma2.win + ma2.loss)) - (ma1.win / (ma1.win + ma1.loss)))
      .filter(ma => ma.win + ma.loss >= GAME_THRESHOLD)
      .filter(ma => ma.name !== deck.name)
      .forEach(ma => {

    if (!hdr_printed) {
      console.log('')
      console.log('----- Matchups for ' + deck.name + ' -----')
      hdr_printed = true
    }

    let win_pct = (ma.win / (ma.win + ma.loss) * 100).toFixed(2) + '%'
    console.log(ma.name + pad(ma.name, 20) + win_pct + pad(win_pct, 6) + '  (' + ma.win + '-' + ma.loss + ')')
  })
})
