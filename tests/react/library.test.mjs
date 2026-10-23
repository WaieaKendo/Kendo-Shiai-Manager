import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_LIBRARY, HOME_SUBTITLE, HOME_TITLE, LIBRARY_HEADING, LIBRARY_INTRO, NEW_TOURNAMENT_TEXT, libraryView,
} from '../../app/react/features/library/library-model.ts';
import { DEFAULT_HOME_LOGO_SRC, DEFAULT_LIBRARY_CARD_MARK } from '../../app/react/shared/ui/branding.ts';

test('legacy texts: the static markup of #home and the card mark', () => {
  assert.equal(HOME_TITLE, 'Kendo Shiai Manager');
  assert.equal(HOME_SUBTITLE, 'Tournament Library');
  assert.equal(LIBRARY_HEADING, 'Your Tournaments');
  assert.equal(LIBRARY_INTRO, 'Create a new tournament or open an existing tournament in Spectator mode.');
  assert.equal(NEW_TOURNAMENT_TEXT, '＋ New Tournament');
  assert.equal(DEFAULT_HOME_LOGO_SRC, '/assets/ksm-fuji-logo.svg');
  assert.equal(DEFAULT_LIBRARY_CARD_MARK, '🏆');
});

test('nothing published yet: the static markup (an empty grid, no message)', () => {
  assert.deepEqual(libraryView(EMPTY_LIBRARY), { cards: [], message: null });
});

test('no rows: the message instead of cards (also an empty message)', () => {
  assert.deepEqual(libraryView({ kind: 'library', cards: [], message: 'No tournaments yet.' }), { cards: [], message: 'No tournaments yet.' });
  assert.deepEqual(libraryView({ kind: 'library', cards: [], message: '' }), { cards: [], message: '' });
});

test('rows: a card each, in order, labelled "Open <name>"; the message is not shown', () => {
  const view = libraryView({ kind: 'library', message: 'Loading tournaments…', cards: [
    { id: 'b', name: 'Aiea <Taikai> & "Co"' }, { id: 'a', name: '' }, { id: 'a', name: 'Duplicate ID' },
  ] });
  assert.equal(view.message, null);
  assert.deepEqual(view.cards, [
    { id: 'b', name: 'Aiea <Taikai> & "Co"', label: 'Open Aiea <Taikai> & "Co"' },
    { id: 'a', name: 'Untitled tournament', label: 'Open Untitled tournament' },
    { id: 'a', name: 'Duplicate ID', label: 'Open Duplicate ID' },
  ]);
});

test('names keep their spaces (the template printed them as they were)', () => {
  assert.equal(libraryView({ kind: 'library', message: '', cards: [{ id: 'x', name: '  Spaced   Name  ' }] }).cards[0].label, 'Open   Spaced   Name  ');
});
