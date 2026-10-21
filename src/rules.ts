import type { Config, RuleId } from "./config";
import type { Comment } from "./extract";

export type Hit = { rule: RuleId; message: string };

const pictograph = /\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F/u;
const banner = /[-=*#~_\/+\u2500-\u257F]{4,}|[\u2500-\u257F]{2,}/;
const region = /^#?\s*(end)?region\b|^MARK:/i;
const todo = /\b(TODO|FIXME|HACK|XXX)\b/;
const removalCondition = /\b(when|until|once|after|before|if)\b|https?:\/\//i;
const speculative =
  /\b(should (work|be fine)|hopefully|handles? (all|every) cases?|not sure|i think|for some reason|magically|works for now|maybe later|just in case)\b/i;
const reasonMarker =
  /\b(because|since|otherwise|so that|avoid|workaround|must|never|always|required|only|unless|why|instead|caution|warning|note)\b/i;

const stopwords = new Set(
  "the a an to of for and or in on at by with from this that these those it its is are be was we our then now here there all into as up out over via current given".split(
    " ",
  ),
);

const synonyms: [RegExp, string[]][] = [
  [/\b(for|foreach|while|forEach|map)\b/, ["loop", "iterate", "each"]],
  [/\b(if|switch|when)\b/, ["check"]],
  [/\+\+|\+=\s*1\b/, ["increment", "add"]],
  [/--|-=\s*1\b/, ["decrement"]],
  [/\bnew\b/, ["create", "instantiate", "make"]],
  [/\bawait\b/, ["wait"]],
  [/\bthrow\b/, ["throw", "error"]],
  [/[^=!<>]=[^=>]/, ["set", "assign", "store"]],
  [/\breturn\b/, ["return"]],
];

const number = /\d+(?:\.\d+)?/g;

const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, (m, _s, i: number) => (i >= 3 ? "" : m));

function codeWords(code: string): Set<string> {
  const words = new Set<string>();
  for (const id of code.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []) {
    for (const part of id.split(/_|(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/)) {
      if (part) words.add(stem(part.toLowerCase()));
    }
  }
  for (const [pattern, adds] of synonyms) if (pattern.test(code)) adds.forEach((w) => words.add(w));
  for (const n of code.match(number) ?? []) words.add(n);
  return words;
}

function narrates(comment: Comment): boolean {
  if (comment.doc || !comment.next || reasonMarker.test(comment.body)) return false;
  // Numbers count as words so a worked calculation reads as content the code lacks.
  const words = (comment.body.toLowerCase().match(/[a-z]{2,}|\d+(?:\.\d+)?/g) ?? []).filter((w) => !stopwords.has(w)).map(stem);
  if (words.length === 0 || words.length > 8) return false;
  const code = codeWords(comment.next);
  return words.filter((w) => code.has(w)).length / words.length >= 0.6;
}

export function evaluate(comment: Comment, config: Config): Hit[] {
  const hits: Hit[] = [];
  const body = comment.body;
  const reference = config.references.map((r) => r.exec(body)?.[0]).find(Boolean);
  if (reference) hits.push({ rule: "references", message: `cites \`${reference}\`; a comment must make sense without another document` });
  if (pictograph.test(body)) hits.push({ rule: "emoji", message: "emoji in a comment" });
  const isBanner = banner.test(body) || region.test(body);
  if (isBanner) hits.push({ rule: "banner", message: "banner or section-heading comment" });
  if (todo.test(body) && !removalCondition.test(body)) {
    hits.push({ rule: "todo", message: "TODO without a removal condition (when/until/once …, or a link)" });
  }
  if (speculative.test(body)) hits.push({ rule: "speculative", message: "speculative wording" });
  if (!isBanner && narrates(comment)) hits.push({ rule: "narration", message: "restates the code it sits on" });
  return hits;
}
