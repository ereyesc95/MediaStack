import { useEffect, useMemo, useRef, useState } from "react";
import {
  createParticipation,
  deleteParticipation,
  fetchArtistDetails,
  fetchFilterOptions,
  fetchInstrumentOptions,
  patchArtist,
  patchParticipation,
  searchMusicBrainz,
  searchRosterBands,
  uploadArtistPhoto,
} from "../../../api";
import type { MbArtistMatch } from "../../../types";
import ModalPortal from "../../ModalPortal";
import MultiSelectDropdown from "../../MultiSelectDropdown";
import SearchableDropdown, {
  type DropdownOption,
} from "../../SearchableDropdown";

type ProjectRow = {
  key: string;
  participation_id?: number;
  band_id: number;
  band_name: string;
  start: string;
  end: string;
  role_ids: string[];
  is_official: boolean;
  is_founding: boolean;
  is_former: boolean;
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
  const [projectRows, setProjectRows] = useState<ProjectRow[]>([
    emptyProjectRow(bandId, bandName, true),
  ]);

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
        if (d.photo_url) setPhotoPreview(d.photo_url);

        const rows: ProjectRow[] = d.participations.map((p) => ({
          key: `arp-${p.participation_id}`,
          participation_id: p.participation_id,
          band_id: p.band_db_id ?? p.band_id ?? bandId,
          band_name: p.name,
          start: p.start ?? "",
          end: p.end ?? "",
          role_ids: labelsToRoleIds(p.roles ?? [], instOpts),
          is_official: p.is_official ?? true,
          is_founding: p.is_founding ?? false,
          is_former: p.is_former ?? false,
          is_current_band: (p.band_db_id ?? p.band_id) === bandId,
        }));
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
    const q = (stageName || name).trim();
    if (!q) {
      setError("Enter a name to search MusicBrainz");
      return;
    }
    setMbBusy(true);
    setError(null);
    setMbMatches([]);
    try {
      const data = await searchMusicBrainz(q);
      setMbMatches(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setMbBusy(false);
    }
  };

  const pickMbMatch = (m: MbArtistMatch) => {
    setStageName(m.name);
    if (!name.trim()) setName(m.name);
    setMbid(m.mbid);
    setMbMatches([]);
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

    setSaving(true);
    setError(null);
    try {
      if (mode === "add") {
        let newArtistId = 0;
        let createdArtist = false;
        for (const row of currentRows) {
          const targetBandId = row.is_current_band ? bandId : row.band_id;
          const rolesText = roleIdsToText(row.role_ids, instrumentOptions);
          const body = {
            start: row.start.trim() || undefined,
            end: row.end.trim() || undefined,
            roles_text: rolesText || undefined,
            is_official: row.is_official,
            is_founding: row.is_founding,
            is_former: row.is_former,
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
          birth_date: birthDate,
          birth_place: birthPlace,
          birth_country_id: birthCountryId ? Number(birthCountryId) : null,
          death_date: deathDate,
          mbid,
        });
        if (photoFile) {
          await uploadArtistPhoto(newArtistId, photoFile);
        }
      } else if (artistId) {
        await patchArtist(artistId, {
          name,
          stage_name: stageName,
          aliases,
          birth_date: birthDate,
          birth_place: birthPlace,
          birth_country_id: birthCountryId ? Number(birthCountryId) : null,
          death_date: deathDate,
          mbid,
        });
        if (photoFile) {
          await uploadArtistPhoto(artistId, photoFile);
        }

        const keptIds = new Set(
          currentRows
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

        for (const row of currentRows) {
          const rolesText = roleIdsToText(row.role_ids, instrumentOptions);
          if (row.participation_id) {
            await patchParticipation(row.band_id, row.participation_id, {
              start: row.start,
              end: row.end,
              roles_text: rolesText,
              is_official: row.is_official,
              is_founding: row.is_founding,
              is_former: row.is_former,
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

        {loading && <p className="muted">Loading…</p>}
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
                <label>
                  Stage / display name
                  <input
                    value={stageName}
                    onChange={(e) => setStageName(e.target.value)}
                  />
                </label>
                <label>
                  Birth / legal name
                  <input value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <div className="member-form__mb-row">
                  <label className="member-form__mbid">
                    MusicBrainz ID
                    <input
                      value={mbid}
                      onChange={(e) => setMbid(e.target.value)}
                      placeholder="Optional UUID"
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn--small"
                    disabled={mbBusy}
                    onClick={() => void handleMbSearch()}
                  >
                    {mbBusy ? "…" : "Lookup"}
                  </button>
                </div>
                {mbMatches.length > 0 && (
                  <ul className="mb-matches member-form__mb-matches">
                    {mbMatches.map((m) => (
                      <li key={m.mbid}>
                        <button
                          type="button"
                          onClick={() => pickMbMatch(m)}
                        >
                          <strong>{m.name}</strong>
                          {m.disambiguation && (
                            <span className="muted"> — {m.disambiguation}</span>
                          )}
                          {m.type && <span className="badge">{m.type}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <label>
                  Aliases (semicolon-separated)
                  <input
                    value={aliases}
                    onChange={(e) => setAliases(e.target.value)}
                  />
                </label>
                <div className="member-form__dates">
                  <label>
                    Birth date
                    <input
                      type="date"
                      value={birthDate.slice(0, 10)}
                      onChange={(e) => setBirthDate(e.target.value)}
                    />
                  </label>
                  <label>
                    Death date
                    <input
                      type="date"
                      value={deathDate.slice(0, 10)}
                      onChange={(e) => setDeathDate(e.target.value)}
                    />
                  </label>
                </div>
                <label className="member-form__birthplace-label">
                  Birth place
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

            <section className="member-form__projects">
              <div className="member-form__projects-head">
                <h4>Related projects</h4>
                <div className="member-form__projects-actions">
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
                    <input
                      className="member-form__col member-form__col--start"
                      value={row.start}
                      onChange={(e) =>
                        updateRow(row.key, { start: e.target.value })
                      }
                    />
                    <input
                      className="member-form__col member-form__col--end"
                      value={row.end}
                      onChange={(e) =>
                        updateRow(row.key, { end: e.target.value })
                      }
                      placeholder="Present"
                    />
                    <div className="member-form__col member-form__col--roles">
                      <MultiSelectDropdown
                        options={instrumentOptions}
                        values={row.role_ids}
                        onChange={(role_ids) =>
                          updateRow(row.key, { role_ids })
                        }
                        placeholder="Instruments"
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
            </section>

            <div className="modal-actions-row">
              <button type="button" className="btn" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                disabled={saving}
                onClick={() => void handleSave()}
              >
                {saving ? "Saving…" : mode === "add" ? "Add member" : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>
    </ModalPortal>
  );
}
