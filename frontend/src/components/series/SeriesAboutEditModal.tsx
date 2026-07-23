import { useEffect, useMemo, useState } from "react";
import {
  fetchSeriesFilterOptions,
  patchSeriesAbout,
} from "../../api";
import type { SeriesOverview } from "../../types";
import ModalPortal from "../ModalPortal";
import SearchableDropdown, {
  type DropdownOption,
} from "../SearchableDropdown";

type ActivityRow = { start: string; end: string };

type Props = {
  franchiseId: string;
  data: SeriesOverview;
  onClose: () => void;
  onSaved: () => void;
};

function periodsToRows(
  periods: SeriesOverview["activity_periods"]
): ActivityRow[] {
  if (!periods.length) return [{ start: "", end: "" }];
  return periods.map((p) => ({
    start: p.start ?? "",
    end: p.end ?? "",
  }));
}

export default function SeriesAboutEditModal({
  franchiseId,
  data,
  onClose,
  onSaved,
}: Props) {
  const [bio, setBio] = useState(data.bio ?? "");
  const [writers, setWriters] = useState(data.writers.join("; "));
  const [publishers, setPublishers] = useState(data.publishers.join("; "));
  const [originCity, setOriginCity] = useState(data.city ?? "");
  const [countryId, setCountryId] = useState(
    data.country?.id != null ? String(data.country.id) : ""
  );
  const [activityRows, setActivityRows] = useState<ActivityRow[]>(() =>
    periodsToRows(data.activity_periods)
  );
  const [countryOptions, setCountryOptions] = useState<DropdownOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSeriesFilterOptions()
      .then((opts) => {
        setCountryOptions(
          opts.country_groups.flatMap((g) =>
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
  }, []);

  const selectedCountry = useMemo(
    () => countryOptions.find((o) => o.value === countryId),
    [countryOptions, countryId]
  );

  const updateActivityRow = (
    index: number,
    field: keyof ActivityRow,
    value: string
  ) => {
    setActivityRows((rows) =>
      rows.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const starts = activityRows.map((r) => r.start.trim()).join(";");
      const ends = activityRows.map((r) => r.end.trim()).join(";");
      await patchSeriesAbout(franchiseId, {
        bio,
        writers,
        publishers,
        origin_city: originCity,
        country_id: countryId ? Number(countryId) : null,
        activity_start: starts,
        activity_end: ends,
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
        className="modal-panel artist-admin-modal artist-admin-modal--wide"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-panel-header">
          <h3>Edit about</h3>
          <button type="button" className="modal-close-x" onClick={onClose}>
            ×
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="artist-admin-form">
          <label>
            Description / bio
            <textarea
              rows={8}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />
          </label>
          <label>
            Writers (semicolon-separated)
            <input
              value={writers}
              onChange={(e) => setWriters(e.target.value)}
            />
          </label>
          <label>
            Origin city
            <input
              value={originCity}
              onChange={(e) => setOriginCity(e.target.value)}
            />
          </label>
          <label>
            Country
            <SearchableDropdown
              options={countryOptions}
              value={countryId}
              onChange={setCountryId}
              placeholder={
                selectedCountry?.label ?? data.country?.name ?? "Search country…"
              }
            />
          </label>
          <label>
            Publishers (semicolon-separated)
            <input
              value={publishers}
              onChange={(e) => setPublishers(e.target.value)}
            />
          </label>
          <div className="artist-about-edit__periods">
            <div className="artist-about-edit__periods-head">
              <span className="artist-admin-form__section">Activity periods</span>
              <button
                type="button"
                className="btn btn--small"
                onClick={() =>
                  setActivityRows((rows) => [...rows, { start: "", end: "" }])
                }
              >
                + Add period
              </button>
            </div>
            {activityRows.map((row, index) => (
              <div key={index} className="artist-about-edit__period-row">
                <label>
                  Start
                  <input
                    value={row.start}
                    onChange={(e) =>
                      updateActivityRow(index, "start", e.target.value)
                    }
                  />
                </label>
                <label>
                  End (empty = present)
                  <input
                    value={row.end}
                    onChange={(e) =>
                      updateActivityRow(index, "end", e.target.value)
                    }
                  />
                </label>
                <button
                  type="button"
                  className="artist-about-edit__period-remove"
                  onClick={() =>
                    setActivityRows((rows) =>
                      rows.length > 1
                        ? rows.filter((_, i) => i !== index)
                        : rows
                    )
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-panel-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}
