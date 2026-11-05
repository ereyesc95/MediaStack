import { useEffect, useMemo, useRef, useState } from "react";
import {
  createParticipation,
  deleteParticipation,
  fetchArtistDetails,
  fetchFilterOptions,
  fetchInstrumentOptions,
  fetchMusicBrainzArtist,
  patchArtist,
  patchParticipation,
  searchMusicBrainz,
  searchRosterBands,
  uploadArtistPhoto,
} from "../../../api";
import type { MbArtistMatch } from "../../../types";
import { parseFlexibleDate } from "../../../formatDate";
import FlexibleDateInput from "../../FlexibleDateInput";
import { IconPlus, IconSearch } from "../../MenuIcons";
import ModalPortal from "../../ModalPortal";
import PlaylistBoot from "../../PlaylistBoot";
import MultiSelectDropdown from "../../MultiSelectDropdown";
import SearchableDropdown, {
  type DropdownOption,
} from "../../SearchableDropdown";

type ProjectRow = {
  key: string;
  participation_id?: number | null;
  band_id: number;
  band_name: string;
  start: string;
  end: string;
  role_ids: string[];
  is_official: boolean;
  is_founding: boolean;
  is_former: boolean;
  is_touring: boolean;
  is_current_band: boolean;
};

type Props = {
  mode: "add" | "edit";
  bandId: number;
  bandName: string;
  artistId?: number;
  stackLayer?: 1 | 2;
  onClose: () => void;
  onSaved: () => void;
};

function roleIdsToText(ids: string[], options: DropdownOption[]): string {
  const map = new Map(options.map((o) => [o.value, o.label]));
  return ids
    .map((id) => map.get(id) ?? "")
    .filter(Boolean)
    .join(", ");
}

function labelsToRoleIds(
  labels: string[],
  options: DropdownOption[]
): string[] {
  const out: string[] = [];
  for (const raw of labels) {
    const key = raw.trim().toLowerCase();
    if (!key) continue;
    let match =
      options.find((o) => o.label.toLowerCase() === key) ??
      options.find(
        (o) =>
          o.label.toLowerCase().includes(key) ||
          key.includes(o.label.toLowerCase())
      );
    if (!match) {
      const first = key.split(/[,\s]+/)[0];
      match = options.find((o) => o.label.toLowerCase().includes(first));
    }
    if (match && !out.includes(match.value)) out.push(match.value);
  }
  return out;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function newRowKey() {
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyProjectRow(
  bandId: number,
  bandName: string,
  isCurrentBand: boolean
): ProjectRow {
  return {
    key: newRowKey(),
    band_id: bandId,
    band_name: bandName,
    start: "",
    end: "",
    role_ids: [],
    is_official: true,
    is_founding: false,
    is_former: false,
    is_touring: false,
    is_current_band: isCurrentBand,
  };
}

export default function MemberFormModal({
  mode,
  bandId,
  bandName,
  artistId,
  stackLayer = 1,
  onClose,
  onSaved,
}: Props) {
  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mbMatches, setMbMatches] = useState<MbArtistMatch[]>([]);
  const [mbBusy, setMbBusy] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [loadedParticipationIds, setLoadedParticipationIds] = useState<number[]>(
    []
  );

  const [name, setName] = useState("");
  const [stageName, setStageName] = useState("");
  const [aliases, setAliases] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [birthPlace, setBirthPlace] = useState("");
  const [birthCountryId, setBirthCountryId] = useState("");
  const [countryOptions, setCountryOptions] = useState<DropdownOption[]>([]);
  const [instrumentOptions, setInstrumentOptions] = useState<DropdownOption[]>(
    []
  );
  const [deathDate, setDeathDate] = useState("");
  const [mbid, setMbid] = useState("");
  const [wikipediaUrl, setWikipediaUrl] = useState("");
  const [musicbrainzUrl, setMusicbrainzUrl] = useState("");
  const [wikidataUrl, setWikidataUrl] = useState("");
  const [expandedSection, setExpandedSection] = useState<
    null | "links" | "projects"
  >(null);
  const [projectRows, setProjectRows] = useState<ProjectRow[]>([
    emptyProjectRow(bandId, bandName, true),
  ]);

  const toggleSection = (section: "links" | "projects") => {
    setExpandedSection((cur) => (cur === section ? null : section));
  };

  useEffect(() => {
    fetchFilterOptions()
      .then((opts) => {
        const groups = opts.all_country_groups ?? opts.country_groups;
        setCountryOptions(
          groups.flatMap((g) =>
            g.items.map((c) => ({
              value: String(c.id),
              label: c.name ?? String(c.id),
              iso: c.iso ?? undefined,
              group: g.continent,
            }))
          )
        );
      })
      .catch(() => {});
    fetchInstrumentOptions()
      .then((data) => {
        setInstrumentOptions(
          data.groups.flatMap((g) =>
            g.items.map((i) => ({
              value: String(i.id),
              label: i.name,
              group: g.type,
            }))
          )
        );
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (mode !== "edit" || !artistId) return;
    setLoading(true);
    Promise.all([
      fetchArtistDetails(artistId, bandId),
      fetchInstrumentOptions(),
    ])
      .then(([d, inst]) => {
        const instOpts = inst.groups.flatMap((g) =>
          g.items.map((i) => ({
            value: String(i.id),
            label: i.name,
            group: g.type,
          }))
        );
        setInstrumentOptions(instOpts);
        setName(d.birth_name ?? d.name);
        setStageName(d.name);
        setAliases(d.aliases.join("; "));
        setBirthDate(d.birth_date ?? "");
        setBirthPlace(d.origin.city ?? "");
        setBirthCountryId(
          d.origin.country?.id != null ? String(d.origin.country.id) : ""
        );
        setDeathDate(d.death_date ?? "");
        setMbid(d.mbid ?? "");
        setWikipediaUrl(d.urls?.wikipedia ?? "");
        setMusicbrainzUrl(d.urls?.musicbrainz ?? "");
        setWikidataUrl(d.urls?.wikidata ?? "");
        if (d.photo_url) setPhotoPreview(d.photo_url);

        // Current-band stints live in band_memberships (participations
        // intentionally omits the page band). Load those first so Official /
        // Touring / Founder / Former match the lineup tab the member is on.
        const currentMemberships =
          d.band_memberships?.length
            ? d.band_memberships
            : d.band_membership
              ? [d.band_membership]
              : [];
        const rows: ProjectRow[] = currentMemberships.map((m) => ({
          key: `arp-${m.participation_id}`,
          participation_id: m.participation_id,
          band_id: bandId,
          band_name: bandName,
          start: m.start ?? "",
          end: m.end ?? "",
          role_ids: labelsToRoleIds(m.roles ?? [], instOpts),
          is_official: m.is_official ?? false,
          is_founding: m.is_founding ?? false,
          is_former: m.is_former ?? false,
          is_touring: m.is_touring ?? false,
          is_current_band: true,
        }));
        for (const p of d.participations) {
          rows.push({
            key: `arp-${p.participation_id ?? `rel-${p.band_db_id ?? p.band_id}`}`,
            participation_id: p.participation_id,
            band_id: p.band_db_id ?? p.band_id ?? 0,
            band_name: p.name,
            start: p.start ?? "",
            end: p.end ?? "",
            role_ids: labelsToRoleIds(p.roles ?? [], instOpts),
            is_official: p.is_official ?? true,
            is_founding: p.is_founding ?? false,
            is_former: p.is_former ?? false,
            is_touring: p.is_touring ?? false,
            is_current_band: false,
          });
        }
        if (!rows.length) {
          rows.push(emptyProjectRow(bandId, bandName, true));
        }
        setProjectRows(rows);
        setLoadedParticipationIds(
          rows
            .map((r) => r.participation_id)
            .filter((id): id is number => id != null)
        );
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [mode, artistId, bandId, bandName]);

  const title = mode === "add" ? "Add member" : "Edit member";

  const handleMbSearch = async () => {
    const q = stageName.trim();
    if (!q) {
      setError("Enter a name or MusicBrainz ID to search");
      return;
    }
    setMbBusy(true);
    setError(null);
    setMbMatches([]);
    try {
      const data = await searchMusicBrainz(q);
      const items = (data.items ?? []).slice(0, 3);
      setMbMatches(items);
      if (!items.length) {
        setError("No MusicBrainz matches found");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setMbBusy(false);
    }
  };

  const pickMbMatch = async (m: MbArtistMatch) => {
    setMbBusy(true);
    setError(null);
    setMbMatches([]);
    // Always put the resolved display name in the search field (replaces a pasted MBID)
    setStageName(m.name);
    setMbid(m.mbid);
    setMusicbrainzUrl(`https://musicbrainz.org/artist/${m.mbid}`);
    try {
      const detail = await fetchMusicBrainzArtist(m.mbid);
      setStageName(detail.name || m.name);
      setMbid(detail.mbid || m.mbid);
      if (detail.mbid) {
        setMusicbrainzUrl(`https://musicbrainz.org/artist/${detail.mbid}`);
      }
      const legal = (detail.legal_name || "").trim();
      if (legal) {
        setName(legal);
      } else if (!name.trim()) {
        setName(detail.name || m.name);
      }
      if (detail.aliases?.length) {
        setAliases(detail.aliases.join("; "));
      }
      if (detail.birth_date) setBirthDate(detail.birth_date);
      if (detail.death_date) setDeathDate(detail.death_date);
      if (detail.birth_place) setBirthPlace(detail.birth_place);
      const iso = (detail.country || "").trim().toUpperCase();
      if (iso) {
        const match = countryOptions.find(
          (c) => (c.iso || "").toUpperCase() === iso
        );
        if (match) setBirthCountryId(match.value);
      }
    } catch (e) {
      // Search hit is enough to link the MBID even if detail fetch fails
      if (!name.trim()) setName(m.name);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setMbBusy(false);
    }
  };

  const handlePhotoPick = (file: File | undefined) => {
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const updateRow = (key: string, patch: Partial<ProjectRow>) => {
    setProjectRows((rows) =>
      rows.map((r) => (r.key === key ? { ...r, ...patch } : r))
    );
  };

  const addProjectRow = () => {
    setProjectRows((rows) => [...rows, emptyProjectRow(0, "", false)]);
  };

  const addStintRow = () => {
    setProjectRows((rows) => [
      ...rows,
      emptyProjectRow(bandId, bandName, true),
    ]);
  };

  const removeRow = (key: string) => {
    setProjectRows((rows) => rows.filter((r) => r.key !== key));
  };

  const searchBands = useMemo(
    () => async (query: string): Promise<DropdownOption[]> => {
      const data = await searchRosterBands(query);
      return (data.items ?? []).map((b) => ({
        value: String(b.id),
        label: b.name,
      }));
    },
    []
  );

  const handleSave = async () => {
    if (mode === "add" && !name.trim() && !stageName.trim()) {
      setError("Name is required");
      return;
    }
    const currentRows = projectRows.filter(
      (r) => r.is_current_band || r.band_id > 0
    );
    if (!currentRows.length) {
      setError("At least one project row is required");
      return;
    }

    const birthStored = parseFlexibleDate(birthDate);
    const deathStored = parseFlexibleDate(deathDate);
    if (birthStored === null || deathStored === null) {
      setError("Use YYYY/MM/DD, YYYY/MM, or YYYY for birth/death dates");
      return;
    }
    const normalizedRows: ProjectRow[] = [];
    for (const row of currentRows) {
      const startStored = parseFlexibleDate(row.start);
      const endStored = parseFlexibleDate(row.end);
      if (startStored === null || endStored === null) {
        setError("Use YYYY/MM/DD, YYYY/MM, or YYYY for project dates");
        return;
      }
      normalizedRows.push({
        ...row,
        start: startStored,
        end: endStored,
      });
    }

    const linkUrls = {
      wikipedia: wikipediaUrl.trim(),
      musicbrainz: musicbrainzUrl.trim(),
      wikidata: wikidataUrl.trim(),
    };

    setSaving(true);
    setError(null);
    try {
      if (mode === "add") {
        let newArtistId = 0;
        let createdArtist = false;
        for (const row of normalizedRows) {
          const targetBandId = row.is_current_band ? bandId : row.band_id;
          const rolesText = roleIdsToText(row.role_ids, instrumentOptions);
          const body = {
            start: row.start.trim() || undefined,
            end: row.end.trim() || undefined,
            roles_text: rolesText || undefined,
            is_official: row.is_official,
            is_founding: row.is_founding,
            is_former: row.is_former,
            is_touring: row.is_touring,
          };
          if (!createdArtist) {
            const created = await createParticipation(targetBandId, {
              name: (stageName || name).trim(),
              mbid: mbid.trim() || undefined,
              ...body,
            });
            newArtistId = created.artist_id;
            createdArtist = true;
          } else {
            await createParticipation(targetBandId, {
              artist_id: newArtistId,
              ...body,
            });
          }
        }
        await patchArtist(newArtistId, {
          name,
          stage_name: stageName,
          aliases,
          birth_date: birthStored,
          birth_place: birthPlace,
          birth_country_id: birthCountryId ? Number(birthCountryId) : null,
          death_date: deathStored,
          mbid,
          urls: linkUrls,
        });
        if (photoFile) {
          await uploadArtistPhoto(newArtistId, photoFile);
        }
      } else if (artistId) {
        await patchArtist(artistId, {
          name,
          stage_name: stageName,
          aliases,
          birth_date: birthStored,
          birth_place: birthPlace,
          birth_country_id: birthCountryId ? Number(birthCountryId) : null,
          death_date: deathStored,
          mbid,
          urls: linkUrls,
        });
        if (photoFile) {
          await uploadArtistPhoto(artistId, photoFile);
        }

        const keptIds = new Set(
          normalizedRows
            .map((r) => r.participation_id)
            .filter((id): id is number => id != null)
        );
        for (const id of loadedParticipationIds) {
          if (!keptIds.has(id)) {
            const row = projectRows.find((r) => r.participation_id === id);
            const deleteBandId = row?.band_id ?? bandId;
            await deleteParticipation(deleteBandId, id);
          }
        }

        for (const row of normalizedRows) {
          const rolesText = roleIdsToText(row.role_ids, instrumentOptions);
          if (row.participation_id) {
            await patchParticipation(row.band_id, row.participation_id, {
              start: row.start,
              end: row.end,
              roles_text: rolesText,
              is_official: row.is_official,
              is_founding: row.is_founding,
              is_former: row.is_former,
              is_touring: row.is_touring,
            });
          } else if (row.band_id > 0) {
            await createParticipation(row.band_id, {
              artist_id: artistId,
              start: row.start.trim() || undefined,
              end: row.end.trim() || undefined,
              roles_text: rolesText || undefined,
              is_official: row.is_official,
              is_founding: row.is_founding,
              is_former: row.is_former,
              is_touring: row.is_touring,
            });
          }
        }
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalPortal onClose={onClose} layer={stackLayer}>
      <div
        className="modal-panel artist-admin-modal artist-admin-modal--member member-form-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-panel-header">
          <h3>{title}</h3>
          <button type="button" className="modal-close-x" onClick={onClose}>
            ×
          </button>
        </div>

        {loading && (
          <PlaylistBoot className="playlist-boot--compact" label="Loading…" />
        )}
        {error && <p className="error">{error}</p>}

        {!loading && (
          <div className="artist-admin-form member-form">
            <div className="member-form__identity">
              <button
                type="button"
                className="member-form__photo"
                onClick={() => fileRef.current?.click()}
                title="Choose photo"
              >
                {photoPreview ? (
                  <img src={photoPreview} alt="" />
                ) : (
                  <span className="member-form__photo-ph">
                    {initials(stageName || name || "?")}
                  </span>
                )}
                <span className="member-form__photo-hint">📷</span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(e) => handlePhotoPick(e.target.files?.[0])}
              />

              <div className="member-form__identity-fields">
                <label className="member-form__field-row">
                  <span className="member-form__field-label">Stage name</span>
                  <div className="member-form__stage-row">
                    <input
                      value={stageName}
                      onChange={(e) => {
                        setStageName(e.target.value);
                        if (mbMatches.length) setMbMatches([]);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleMbSearch();
                        }
                      }}
                      placeholder="Name or MusicBrainz ID"
                    />
                    <button
                      type="button"
                      className="member-form__mb-search"
                      disabled={mbBusy}
                      onClick={() => void handleMbSearch()}
                      title="Search MusicBrainz by name or MBID"
                      aria-label="Search MusicBrainz"
                    >
                      {mbBusy ? (
                        <span className="member-form__mb-search-busy" aria-hidden>
                          …
                        </span>
                      ) : (
                        <IconSearch className="member-form__mb-search-icon" />
                      )}
                    </button>
                  </div>
                </label>
                {mbMatches.length > 0 && (
                  <ul className="mb-matches member-form__mb-matches">
                    {mbMatches.map((m) => (
                      <li key={m.mbid}>
                        <button
                          type="button"
                          disabled={mbBusy}
                          onClick={() => void pickMbMatch(m)}
                        >
                          <strong>{m.name}</strong>
                          {m.disambiguation && (
                            <span className="muted"> — {m.disambiguation}</span>
                          )}
                          {m.country && (
                            <span className="muted"> · {m.country}</span>
                          )}
                          {m.type && <span className="badge">{m.type}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <label className="member-form__field-row">
                  <span className="member-form__field-label">Full name</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <label className="member-form__field-row">
                  <span className="member-form__field-label">Other names</span>
                  <input
                    value={aliases}
                    onChange={(e) => setAliases(e.target.value)}
                    placeholder="Use ; to add more"
                  />
                </label>
                <div className="member-form__dates">
                  <label className="member-form__field-row">
                    <span className="member-form__field-label">Birth date</span>
                    <FlexibleDateInput
                      value={birthDate}
                      onChange={setBirthDate}
                      placeholder="YYYY/MM/DD"
                    />
                  </label>
                  <label className="member-form__field-row">
                    <span className="member-form__field-label">Death date</span>
                    <FlexibleDateInput
                      value={deathDate}
                      onChange={setDeathDate}
                      placeholder="YYYY/MM/DD"
                    />
                  </label>
                </div>
                <label className="member-form__field-row member-form__birthplace-label">
                  <span className="member-form__field-label">Birth place</span>
                  <div className="member-form__birthplace-row">
                    <input
                      value={birthPlace}
                      onChange={(e) => setBirthPlace(e.target.value)}
                      placeholder="City"
                    />
                    <SearchableDropdown
                      options={countryOptions}
                      value={birthCountryId}
                      onChange={setBirthCountryId}
                      placeholder="Country"
                    />
                  </div>
                </label>
              </div>
            </div>

            <section
              className={`member-form__links${
                expandedSection === "links" ? " is-expanded" : ""
              }`}
            >
              <button
                type="button"
                className="member-form__section-heading"
                aria-expanded={expandedSection === "links"}
                onClick={() => toggleSection("links")}
              >
                Links
              </button>
              <div className="member-form__section-collapse" inert={expandedSection !== "links" ? true : undefined}>
                <div className="member-form__section-collapse-inner">
                  <div className="member-form__section-body">
                    <label className="member-form__field-row">
                      <span className="member-form__field-label">Wikipedia</span>
                      <input
                        type="url"
                        value={wikipediaUrl}
                        onChange={(e) => setWikipediaUrl(e.target.value)}
                        placeholder="https://en.wikipedia.org/wiki/…"
                      />
                    </label>
                    <label className="member-form__field-row">
                      <span className="member-form__field-label">MusicBrainz</span>
                      <input
                        type="url"
                        value={musicbrainzUrl}
                        onChange={(e) => setMusicbrainzUrl(e.target.value)}
                        placeholder="https://musicbrainz.org/artist/…"
                      />
                    </label>
                    <label className="member-form__field-row">
                      <span className="member-form__field-label">Wikidata</span>
                      <input
                        type="url"
                        value={wikidataUrl}
                        onChange={(e) => setWikidataUrl(e.target.value)}
                        placeholder="https://www.wikidata.org/wiki/…"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </section>

            <section
              className={`member-form__projects${
                expandedSection === "projects" ? " is-expanded" : ""
              }`}
            >
              <div className="member-form__projects-head">
                <button
                  type="button"
                  className="member-form__section-heading"
                  aria-expanded={expandedSection === "projects"}
                  onClick={() => toggleSection("projects")}
                >
                  Related projects
                </button>
                <div
                  className="member-form__projects-actions"
                  inert={expandedSection !== "projects" ? true : undefined}
                >
                  <button
                    type="button"
                    className="btn btn--small"
                    onClick={addStintRow}
                  >
                    + Add stint
                  </button>
                  <button
                    type="button"
                    className="btn btn--small"
                    onClick={addProjectRow}
                  >
                    + Add project
                  </button>
                </div>
              </div>

              <div
                className="member-form__section-collapse"
                inert={expandedSection !== "projects" ? true : undefined}
              >
                <div className="member-form__section-collapse-inner">
                  <div className="member-form__project-table">
                    <div className="member-form__project-cols" aria-hidden>
                      <span className="member-form__col member-form__col--project">
                        Project
                      </span>
                      <span className="member-form__col member-form__col--start">
                        Start
                      </span>
                      <span className="member-form__col member-form__col--end">
                        End
                      </span>
                      <span className="member-form__col member-form__col--roles">
                        Roles
                      </span>
                      <span className="member-form__col member-form__col--membership">
                        Membership
                      </span>
                      <span className="member-form__col member-form__col--action" />
                    </div>
                    {projectRows.map((row) => (
                      <div key={row.key} className="member-form__project-row">
                        <div className="member-form__col member-form__col--project member-form__project-band">
                          {row.is_current_band ? (
                            <input value={row.band_name} readOnly />
                          ) : (
                            <SearchableDropdown
                              options={
                                row.band_id && row.band_name
                                  ? [
                                      {
                                        value: String(row.band_id),
                                        label: row.band_name,
                                      },
                                    ]
                                  : []
                              }
                              value={row.band_id ? String(row.band_id) : ""}
                              onChange={(v) => {
                                updateRow(row.key, { band_id: Number(v) });
                              }}
                              placeholder="Search band…"
                              minQueryLength={1}
                              onSearch={searchBands}
                            />
                          )}
                        </div>
                        <FlexibleDateInput
                          className="member-form__col member-form__col--start"
                          value={row.start}
                          onChange={(start) => updateRow(row.key, { start })}
                          placeholder="YYYY/MM/DD"
                        />
                        <FlexibleDateInput
                          className="member-form__col member-form__col--end"
                          value={row.end}
                          onChange={(end) => updateRow(row.key, { end })}
                          placeholder="YYYY/MM/DD"
                          title="YYYY/MM/DD, YYYY/MM, YYYY, or leave blank for Present"
                        />
                        <div className="member-form__col member-form__col--roles">
                          <MultiSelectDropdown
                            options={instrumentOptions}
                            values={row.role_ids}
                            onChange={(role_ids) =>
                              updateRow(row.key, { role_ids })
                            }
                            placeholder="Instruments"
                            portal
                            visibleRows={5}
                          />
                        </div>
                        <div className="member-form__col member-form__col--membership member-form__membership">
                          <button
                            type="button"
                            className={`member-form__pill${
                              row.is_official ? " member-form__pill--on" : ""
                            }`}
                            onClick={() =>
                              updateRow(row.key, {
                                is_official: !row.is_official,
                              })
                            }
                          >
                            Official
                          </button>
                          <button
                            type="button"
                            className={`member-form__pill${
                              row.is_founding ? " member-form__pill--on" : ""
                            }`}
                            onClick={() =>
                              updateRow(row.key, {
                                is_founding: !row.is_founding,
                              })
                            }
                          >
                            Founder
                          </button>
                          <button
                            type="button"
                            className={`member-form__pill${
                              row.is_touring ? " member-form__pill--on" : ""
                            }`}
                            onClick={() =>
                              updateRow(row.key, {
                                is_touring: !row.is_touring,
                              })
                            }
                          >
                            Touring
                          </button>
                          <button
                            type="button"
                            className={`member-form__pill${
                              row.is_former ? " member-form__pill--on" : ""
                            }`}
                            onClick={() =>
                              updateRow(row.key, { is_former: !row.is_former })
                            }
                          >
                            Former
                          </button>
                        </div>
                        {projectRows.length > 1 ? (
                          <button
                            type="button"
                            className="member-form__col member-form__col--action member-form__remove-row"
                            onClick={() => removeRow(row.key)}
                            aria-label="Remove row"
                          >
                            ×
                          </button>
                        ) : (
                          <span className="member-form__col member-form__col--action" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <div className="modal-actions-row">
              <button
                type="button"
                className="btn"
                disabled={saving}
                onClick={() => void handleSave()}
              >
                {saving ? (
                  "Saving…"
                ) : mode === "add" ? (
                  <>
                    <IconPlus className="member-form__add-icon" />
                    Add member
                  </>
                ) : (
                  "Save"
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </ModalPortal>
  );
}
