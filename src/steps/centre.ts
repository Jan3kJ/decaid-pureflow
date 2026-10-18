// The selected step card sits in the centre of the card row (spec 3.7, the step editor's cards):
// where the row must scroll to for that, held within what the row can scroll, so that the first
// and last cards come as near the centre as the row allows.

/**
 * The row's scroll position that puts a card's centre on the row's centre.
 * `cardLeft` is the card's left edge in the row's content (scroll 0), all in CSS pixels.
 */
export function centredScroll(cardLeft: number, cardWidth: number, rowWidth: number, contentWidth: number): number {
  const most = Math.max(0, contentWidth - rowWidth);
  const wanted = cardLeft + cardWidth / 2 - rowWidth / 2;
  return Math.min(most, Math.max(0, wanted));
}
