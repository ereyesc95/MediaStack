using System.Collections.Generic;

namespace Aoide.Forms
{
    public class SetlistsResponse
    {
        public List<Setlist> setlist { get; set; }
        public int total { get; set; }
        public int page { get; set; }
        public int itemsPerPage { get; set; }
    }

    public class Setlist
    {
        public string eventDate { get; set; }
    }
}