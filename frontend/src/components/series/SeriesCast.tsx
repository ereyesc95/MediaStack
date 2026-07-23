import { useEffect, useMemo, useRef, useState } from "react";
import {
  addSeriesCastMember,
  patchSeriesCastMember,
  removeSeriesCastMember,
} from "../../api";
import type {
  SeriesCastMember,
  SeriesCastPerformance,
  SeriesCastTab,
  SeriesLanguageOption,
} from "../../types";
import { isPhoneLayout, useDeviceLayout } from "../../usePhoneLayout";
import { IconEditProfile } from "../MenuIcons";
import ModalPortal from "../ModalPortal";

type Props = {
  franchiseId: string;
  franchiseName: string;
  cast: {
    characters?: SeriesCastMember[];
    staff?: SeriesCastMember[];
    animated?: SeriesCastMember[];
    people?: SeriesCastMember[];
  };
  /** Franchise-selected language codes (About). */
  languages?: string[];
  languageOptions?: SeriesLanguageOption[];
  originLanguage?: string | null;
  tab: SeriesCastTab;
  isAdmin?: boolean;
  addOpen?: boolean;
  onAddClose?: () => void;
  onDataChanged: () => void;
};

/** Language code → flag-icons country ISO */
const LANG_FLAG_ISO: Record<string, string> = {
  ja: "jp",
  en: "gb",
  "es-ES": "es",
  "es-419": "mx",
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function splitRows<T>(items: T[], perRow?: number): { top: T[]; bottom: T[] } {
  if (perRow != null && perRow > 0) {
    return { top: items.slice(0, perRow), bottom: items.slice(perRow) };
  }
  const topCount = Math.ceil(items.length / 2);
  return { top: items.slice(0, topCount), bottom: items.slice(topCount) };
}

function flagIso(lang: string): string {
  return LANG_FLAG_ISO[lang] || lang.slice(0, 2).toLowerCase();
}

function performanceForLang(
  member: SeriesCastMember,
  lang: string | null
): SeriesCastPerformance | null {
  const perfs = member.performances || [];
  if (!perfs.length) return null;
  if (lang) {
    const match = perfs.find(
      (p) => (p.language || "").toLowerCase() === lang.toLowerCase()
    );
    if (match) return match;
  }
  return perfs[0];
}

function actorLabel(member: SeriesCastMember, lang: string | null): string {
  const perf = performanceForLang(member, lang);
  if (perf?.actor_name) return perf.actor_name;
  if (member.actors?.length) {
    const byLang = lang
      ? member.actors.find(
          (a) => (a.language || "").toLowerCase() === lang.toLowerCase()
        )
      : null;
    if (byLang?.name) return byLang.name;
    return member.actors.map((a) => a.name).filter(Boolean).join(" · ");
  }
  return (member.roles || []).filter(Boolean).join(" · ");
}

/** Actors to list under a character, ordered by franchise language list
 *  (origin / first language first). */
function actorsForDisplay(
  member: SeriesCastMember,
  franchiseLangs: string[],
  originLanguage?: string | null
): { language: string; name: string; photo_url?: string | null }[] {
  const out: {
    language: string;
    name: string;
    photo_url?: string | null;
  }[] = [];
  let langs =
    franchiseLangs.length > 0
      ? [...franchiseLangs]
      : (member.performances || [])
          .map((p) => p.language)
          .filter(Boolean) as string[];

  // Origin language first
  if (originLanguage) {
    langs = [
      originLanguage,
      ...langs.filter(
        (l) => l.toLowerCase() !== originLanguage.toLowerCase()
      ),
    ];
  }

  for (const lang of langs) {
    const perf = performanceForLang(member, lang);
    if (perf?.actor_name) {
      out.push({
        language: lang,
        name: perf.actor_name,
        photo_url: perf.photo_url,
      });
      continue;
    }
    const actor = (member.actors || []).find(
      (a) =>
        a.name &&
        (!a.language || a.language.toLowerCase() === lang.toLowerCase())
    );
    if (actor?.name && !out.some((o) => o.name === actor.name && o.language === lang)) {
      if (!actor.language && out.length > 0) continue;
      out.push({
        language: lang,
        name: actor.name,
        photo_url: actor.photo_url,
      });
    }
  }

  if (!out.length && (member.roles?.length || member.actors?.length)) {
    const name = member.actors?.[0]?.name || member.roles?.[0] || "";
    if (name) {
      out.push({
        language: originLanguage || franchiseLangs[0] || "ja",
        name,
        photo_url:
          member.actors?.[0]?.photo_url ||
          member.actor_photo_url ||
          member.character_photo_url,
      });
    }
  }
  return out;
}

function MemberCard({
  member,
  characterCentered,
  franchiseLangs,
  originLanguage,
  onSelect,
}: {
  member: SeriesCastMember;
  characterCentered: boolean;
  franchiseLangs: string[];
  originLanguage?: string | null;
  onSelect: (m: SeriesCastMember) => void;
}) {
  const layout = useDeviceLayout();
  const tapToSwap =
    isPhoneLayout(layout) ||
    (typeof window !== "undefined" &&
      window.matchMedia("(hover: none)").matches);

  const [photoFailed, setPhotoFailed] = useState(false);
  /** Actor photo src kept mounted so opacity can transition. */
  const [actorSrc, setActorSrc] = useState<string | null>(null);
  /** When true, crossfade to actor layer. */
  const [actorVisible, setActorVisible] = useState(false);
  const fadeRaf = useRef(0);
  const clearTimer = useRef(0);
  const hoverGen = useRef(0);

  const characterUrl = member.photo_url;
  const actors = characterCentered
    ? actorsForDisplay(member, franchiseLangs, originLanguage)
    : [];
  const baseUrl = characterUrl && !photoFailed ? characterUrl : null;
  const staffSubtitle = !characterCentered
    ? member.roles?.filter(Boolean).join(" · ")
    : null;

  const clearActorPhoto = () => {
    hoverGen.current += 1;
    cancelAnimationFrame(fadeRaf.current);
    window.clearTimeout(clearTimer.current);
    setActorVisible(false);
    clearTimer.current = window.setTimeout(() => setActorSrc(null), 260);
  };

  const showActorPhoto = (url: string | null) => {
    cancelAnimationFrame(fadeRaf.current);
    window.clearTimeout(clearTimer.current);
    if (!url) {
      clearActorPhoto();
      return;
    }
    const gen = ++hoverGen.current;
    // Preload so the fade isn't skipped while the browser fetches the actor still.
    const preload = new Image();
    preload.src = url;
    const startFade = () => {
      if (gen !== hoverGen.current) return;
      setActorSrc(url);
      setActorVisible(false);
      fadeRaf.current = requestAnimationFrame(() => {
        fadeRaf.current = requestAnimationFrame(() => {
          if (gen !== hoverGen.current) return;
          setActorVisible(true);
        });
      });
    };
    if (preload.complete) startFade();
    else preload.onload = startFade;
  };

  useEffect(() => {
    setPhotoFailed(false);
    hoverGen.current += 1;
    cancelAnimationFrame(fadeRaf.current);
    window.clearTimeout(clearTimer.current);
    setActorSrc(null);
    setActorVisible(false);
  }, [member.photo_url, member.id]);

  useEffect(
    () => () => {
      cancelAnimationFrame(fadeRaf.current);
      window.clearTimeout(clearTimer.current);
    },
    []
  );

  return (
    <div
      className={`artist-lineup-card series-cast-card${
        member.is_deceased ? " artist-lineup-card--deceased" : ""
      }${actorVisible ? " series-cast-card--actor-shown" : ""}`}
    >
      <button
        type="button"
        className="series-cast-card__main"
        onClick={() => onSelect(member)}
      >
        <span className="artist-lineup-card__photo series-cast-card__photo">
          {baseUrl ? (
            <img
              src={baseUrl}
              alt=""
              className={`series-cast-card__photo-layer series-cast-card__photo-layer--base${
                actorVisible ? " is-faded" : ""
              }`}
              onError={() => setPhotoFailed(true)}
            />
          ) : (
            <span
              className={`artist-lineup-card__ph series-cast-card__photo-layer series-cast-card__photo-layer--base${
                actorVisible ? " is-faded" : ""
              }`}
            >
              {initials(member.name)}
            </span>
          )}
          {actorSrc ? (
            <img
              src={actorSrc}
              alt=""
              className={`series-cast-card__photo-layer series-cast-card__photo-layer--hover${
                actorVisible ? " is-visible" : ""
              }`}
              onError={() => clearActorPhoto()}
            />
          ) : null}
        </span>
        <span className="artist-lineup-card__name">
          {member.name}
          {member.is_deceased ? (
            <span className="artist-lineup-card__deceased" title="Deceased">
              †
            </span>
          ) : null}
        </span>
      </button>
      {characterCentered && actors.length > 0 ? (
        <ul className="series-cast-card__actors">
          {actors.map((a) => {
            const photo = a.photo_url || null;
            const isActive = actorVisible && actorSrc === photo;
            return (
              <li key={`${a.language}-${a.name}`}>
                <button
                  type="button"
                  className={`series-cast-card__actor${
                    isActive ? " is-active" : ""
                  }`}
                  title={a.name}
                  aria-pressed={tapToSwap ? isActive : undefined}
                  onMouseEnter={() => {
                    if (!tapToSwap) showActorPhoto(photo);
                  }}
                  onMouseLeave={() => {
                    if (!tapToSwap) clearActorPhoto();
                  }}
                  onFocus={() => {
                    if (!tapToSwap) showActorPhoto(photo);
                  }}
                  onBlur={() => {
                    if (!tapToSwap) clearActorPhoto();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (tapToSwap) {
                      if (isActive) clearActorPhoto();
                      else showActorPhoto(photo);
                      return;
                    }
                    onSelect(member);
                  }}
                >
                  <span
                    className={`fi fi-${flagIso(a.language)} series-cast-card__flag`}
                    aria-hidden
                  />
                  <span className="series-cast-card__actor-name">{a.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {staffSubtitle ? (
        <span className="artist-lineup-card__roles">{staffSubtitle}</span>
      ) : null}
    </div>
  );
}

function CastMemberModal({
  member,
  franchiseId,
  franchiseName,
  isAdmin,
  bucket,
  franchiseLangs,
  languageOptions,
  onClose,
  onDataChanged,
}: {
  member: SeriesCastMember;
  franchiseId: string;
  franchiseName: string;
  isAdmin?: boolean;
  bucket: SeriesCastTab;
  franchiseLangs: string[];
  languageOptions: SeriesLanguageOption[];
  onClose: () => void;
  onDataChanged: () => void;
}) {
  const characterCentered = bucket === "characters";
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);

  const defaultLang =
    franchiseLangs[0] || languageOptions[0]?.code || "en";
  const [charName, setCharName] = useState(
    member.character || member.name || ""
  );
  const [editLang, setEditLang] = useState(defaultLang);
  const [actorsText, setActorsText] = useState(
    actorLabel(member, defaultLang)
  );
  const [photoUrl, setPhotoUrl] = useState(member.photo_url || "");
  const [actorPhotoUrl, setActorPhotoUrl] = useState(
    performanceForLang(member, defaultLang)?.photo_url ||
      member.actor_photo_url ||
      member.character_photo_url ||
      ""
  );

  useEffect(() => {
    setActorsText(actorLabel(member, editLang));
    setActorPhotoUrl(
      performanceForLang(member, editLang)?.photo_url || ""
    );
  }, [editLang, member]);

  const handleSave = async () => {
    if (member.id == null) return;
    setBusy(true);
    setError(null);
    try {
      const actors = actorsText
        .split(/[;·,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      await patchSeriesCastMember(franchiseId, member.id, {
        bucket,
        name: characterCentered ? actors[0] || charName : charName,
        character: characterCentered ? charName : undefined,
        photo_url: photoUrl.trim() || null,
        actor_photo_url: actorPhotoUrl.trim() || null,
        actors: characterCentered ? actors : undefined,
        roles: actors,
        language: characterCentered ? editLang : undefined,
      });
      onDataChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (member.id == null) return;
    if (!window.confirm(`Remove “${member.name}” from cast?`)) return;
    setBusy(true);
    setError(null);
    try {
      await removeSeriesCastMember(franchiseId, member.id, bucket);
      onDataChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const displayPhoto = member.photo_url;
  const listed = actorsForDisplay(member, franchiseLangs, franchiseLangs[0]);

  return (
    <ModalPortal onClose={onClose}>
      <div
        className="modal-panel artist-member-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-panel-header artist-member-modal__header">
          <div className="artist-member-modal__header-actions">
            {isAdmin && member.id != null ? (
              <button
                type="button"
                className="artist-member-modal__edit-icon"
                aria-label="Edit member"
                title="Edit"
                onClick={() => setEditing((v) => !v)}
              >
                <IconEditProfile />
              </button>
            ) : null}
            <button
              type="button"
              className="modal-close-x"
              aria-label="Close"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </div>

        {!editing ? (
          <div className="artist-member-modal__body">
            <div className="artist-member-modal__hero">
              <span className="artist-member-modal__photo-btn">
                {displayPhoto && !photoFailed ? (
                  <img
                    src={displayPhoto}
                    alt=""
                    onError={() => setPhotoFailed(true)}
                  />
                ) : (
                  <span className="artist-member-modal__ph">
                    {initials(member.name)}
                  </span>
                )}
              </span>
              <div className="artist-member-modal__info">
                <p className="artist-member-modal__title">{member.name}</p>
                {characterCentered && listed.length > 0 ? (
                  <div className="artist-member-modal__row">
                    <span className="artist-member-modal__label">
                      Portrayed by:
                    </span>
                    <ul className="series-cast-modal__actors">
                      {listed.map((a) => (
                        <li key={`${a.language}-${a.name}`}>
                          <span
                            className={`fi fi-${flagIso(a.language)}`}
                            aria-hidden
                          />{" "}
                          {a.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {!characterCentered && member.roles?.length ? (
                  <p className="artist-member-modal__row">
                    <span className="artist-member-modal__label">Roles:</span>
                    <span className="artist-member-modal__value">
                      {member.roles.join(" · ")}
                    </span>
                  </p>
                ) : null}
                <div className="artist-member-modal__row artist-member-modal__row--projects">
                  <span className="artist-member-modal__label">
                    Related projects:
                  </span>
                  <ul className="artist-member-modal__projects">
                    <li>
                      <span className="artist-member-modal__project-name">
                        {franchiseName}
                      </span>
                    </li>
                  </ul>
                </div>
                {error ? <p className="error">{error}</p> : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="artist-admin-form" style={{ padding: "0.5rem 0 1rem" }}>
            <label>
              {characterCentered ? "Character name" : "Name"}
              <input
                value={charName}
                onChange={(e) => setCharName(e.target.value)}
              />
            </label>
            {characterCentered ? (
              <>
                <label>
                  Language
                  <select
                    value={editLang}
                    onChange={(e) => setEditLang(e.target.value)}
                  >
                    {(languageOptions.length
                      ? languageOptions
                      : franchiseLangs.map((c) => ({ code: c, label: c }))
                    ).map((o) => (
                      <option key={o.code} value={o.code}>
                        {o.label.replace(/\s*\(origin\)\s*$/i, "")}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Actor for this language
                  <input
                    value={actorsText}
                    onChange={(e) => setActorsText(e.target.value)}
                    placeholder="Actor name"
                  />
                </label>
              </>
            ) : null}
            <label>
              {characterCentered ? "Character photo URL" : "Photo URL"}
              <input
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
              />
            </label>
            {characterCentered ? (
              <label>
                Actor photo URL
                <input
                  value={actorPhotoUrl}
                  onChange={(e) => setActorPhotoUrl(e.target.value)}
                />
              </label>
            ) : null}
            {error ? <p className="error">{error}</p> : null}
            <div className="modal-actions-row">
              <button
                type="button"
                className="btn link-form__delete"
                disabled={busy}
                onClick={() => void handleRemove()}
              >
                Remove
              </button>
              <span className="modal-actions__spacer" />
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy || !charName.trim()}
                onClick={() => void handleSave()}
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>
    </ModalPortal>
  );
}

function AddCastModal({
  franchiseId,
  bucket,
  languageOptions,
  defaultLanguage,
  onClose,
  onSaved,
}: {
  franchiseId: string;
  bucket: SeriesCastTab;
  languageOptions: SeriesLanguageOption[];
  defaultLanguage: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const characterCentered = bucket === "characters";
  const [charName, setCharName] = useState("");
  const [actorName, setActorName] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [actorPhotoUrl, setActorPhotoUrl] = useState("");
  const [lang, setLang] = useState(
    defaultLanguage || languageOptions[0]?.code || "en"
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!charName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await addSeriesCastMember(franchiseId, {
        bucket,
        name: characterCentered
          ? actorName.trim() || charName.trim()
          : charName.trim(),
        character: characterCentered ? charName.trim() : undefined,
        photo_url: characterCentered
          ? actorPhotoUrl.trim() || undefined
          : photoUrl.trim() || undefined,
        character_photo_url: characterCentered
          ? photoUrl.trim() || undefined
          : undefined,
        roles: actorName.trim() ? [actorName.trim()] : undefined,
        language: characterCentered ? lang : undefined,
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalPortal onClose={onClose}>
      <div
        className="modal-panel artist-admin-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-panel-header">
          <h3>
            Add {characterCentered ? "character" : "staff member"}
          </h3>
          <button type="button" className="modal-close-x" onClick={onClose}>
            ×
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
        <div className="artist-admin-form">
          <label>
            {characterCentered ? "Character name" : "Name"}
            <input
              value={charName}
              onChange={(e) => setCharName(e.target.value)}
              autoFocus
            />
          </label>
          {characterCentered ? (
            <>
              <label>
                Language
                <select value={lang} onChange={(e) => setLang(e.target.value)}>
                  {(languageOptions.length
                    ? languageOptions
                    : [{ code: lang, label: lang }]
                  ).map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.label.replace(/\s*\(origin\)\s*$/i, "")}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Actor / portrayed by (optional)
                <input
                  value={actorName}
                  onChange={(e) => setActorName(e.target.value)}
                />
              </label>
              <label>
                Character photo URL (optional)
                <input
                  value={photoUrl}
                  onChange={(e) => setPhotoUrl(e.target.value)}
                />
              </label>
              <label>
                Actor photo URL (optional)
                <input
                  value={actorPhotoUrl}
                  onChange={(e) => setActorPhotoUrl(e.target.value)}
                />
              </label>
            </>
          ) : (
            <label>
              Photo URL (optional)
              <input
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
              />
            </label>
          )}
        </div>
        <div className="modal-panel-actions modal-panel-actions--end">
          <button
            type="button"
            className="btn btn--primary"
            disabled={saving || !charName.trim()}
            onClick={() => void save()}
          >
            {saving ? "Adding…" : "Add"}
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}

export default function SeriesCast({
  franchiseId,
  franchiseName,
  cast,
  languages,
  languageOptions,
  originLanguage,
  tab,
  isAdmin,
  addOpen,
  onAddClose,
  onDataChanged,
}: Props) {
  const [modalMember, setModalMember] = useState<SeriesCastMember | null>(null);
  const deviceLayout = useDeviceLayout();
  const characterCentered = tab === "characters";

  const franchiseLangs = useMemo(() => {
    const langs = languages?.length
      ? [...languages]
      : originLanguage
        ? [originLanguage]
        : [];
    if (originLanguage && langs.length) {
      return [
        originLanguage,
        ...langs.filter(
          (l) => l.toLowerCase() !== originLanguage.toLowerCase()
        ),
      ];
    }
    return langs;
  }, [languages, originLanguage]);

  const members = useMemo(() => {
    const list =
      tab === "characters"
        ? cast.characters || cast.animated || []
        : cast.staff || cast.people || [];
    return list.slice(0, 8);
  }, [cast, tab]);

  const rows = useMemo(
    () =>
      splitRows(members, deviceLayout === "mobile-landscape" ? 5 : undefined),
    [members, deviceLayout]
  );

  const allLangOptions = useMemo(() => {
    if (languageOptions?.length) {
      return languageOptions.map((o) => ({
        ...o,
        label: o.label.replace(/\s*\(origin\)\s*$/i, ""),
      }));
    }
    return franchiseLangs.map((code) => ({ code, label: code }));
  }, [languageOptions, franchiseLangs]);

  if (!members.length && !addOpen) {
    return (
      <div className="artist-lineup">
        <p className="muted artist-lineup__empty">
          No {tab === "characters" ? "characters" : "staff"} yet. Use the menu
          → <strong>Add member</strong>
          {isAdmin ? "" : " (admin)"}, or refresh metadata from TMDb.
        </p>
        {addOpen && onAddClose ? (
          <AddCastModal
            franchiseId={franchiseId}
            bucket={tab}
            languageOptions={allLangOptions}
            defaultLanguage={franchiseLangs[0] || null}
            onClose={onAddClose}
            onSaved={onDataChanged}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="artist-lineup series-cast">
      {members.length === 0 ? (
        <p className="muted artist-lineup__empty">No members in this group.</p>
      ) : (
        <div
          className="artist-lineup-grid"
          data-count={Math.min(Math.max(members.length, 1), 8)}
        >
          <div className="artist-lineup-row">
            {rows.top.map((m, i) => (
              <MemberCard
                key={`${m.id ?? m.name}-t${i}`}
                member={m}
                characterCentered={characterCentered}
                franchiseLangs={franchiseLangs}
                originLanguage={originLanguage}
                onSelect={setModalMember}
              />
            ))}
          </div>
          {rows.bottom.length > 0 ? (
            <div className="artist-lineup-row">
              {rows.bottom.map((m, i) => (
                <MemberCard
                  key={`${m.id ?? m.name}-b${i}`}
                  member={m}
                  characterCentered={characterCentered}
                  franchiseLangs={franchiseLangs}
                  originLanguage={originLanguage}
                  onSelect={setModalMember}
                />
              ))}
            </div>
          ) : null}
        </div>
      )}

      {modalMember ? (
        <CastMemberModal
          member={modalMember}
          franchiseId={franchiseId}
          franchiseName={franchiseName}
          isAdmin={isAdmin}
          bucket={tab}
          franchiseLangs={franchiseLangs}
          languageOptions={allLangOptions}
          onClose={() => setModalMember(null)}
          onDataChanged={onDataChanged}
        />
      ) : null}

      {addOpen && onAddClose ? (
        <AddCastModal
          franchiseId={franchiseId}
          bucket={tab}
          languageOptions={allLangOptions}
          defaultLanguage={franchiseLangs[0] || null}
          onClose={onAddClose}
          onSaved={onDataChanged}
        />
      ) : null}
    </div>
  );
}
