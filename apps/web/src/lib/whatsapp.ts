/** A wa.me link to a number, with the message prefilled. */
export function waLink(number: string, text: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

/** A wa.me link that lets the user pick the recipient. */
export function waShareLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
