using System;
using System.Collections.Generic;
using System.Linq;
using System.Web;
using System.Web.UI;
using System.Web.UI.WebControls;
using System.Data;
using MySql.Data.MySqlClient;
using System.IO;
using DeviceId;
using System.Threading.Tasks;
using Hqub.MusicBrainz.API;
using Aoide.Forms;
using MediaBinger;

namespace Aoide.Forms
{
    public partial class PlaylistData : System.Web.UI.Page
    {
        protected void Page_Load(object sender, EventArgs e)
        {
            //Populate select with playlists
            string strPlaylistType =Session["curPageID"].ToString();
            DataTable dtPlaylists = ExtServices.GetRecordByValue("playlists", "plaType", strPlaylistType);

            if (dtPlaylists != null && dtPlaylists.Rows.Count > 0)
            {
                for (int i = 0; i < dtPlaylists.Rows.Count; i++)
                {
                    playlistList.Items.Add(new ListItem(dtPlaylists.Rows[i]["plaName"].ToString(), dtPlaylists.Rows[i]["plaID"].ToString()));
                }
            }
        }

        protected void submit_Click(object sender, EventArgs e)
        {
            //User Image
            if (playlistImage.HasFile && Request.Form.Get("playlistName").ToString() != "")
            {
                playlistImage.SaveAs(Server.MapPath("~/Images/Playlists/") + Request.Form.Get("playlistName").ToString() + Path.GetExtension(playlistImage.FileName));
            }
            return;
        }

        [System.Web.Services.WebMethod]
        public static string SavePlaylistChanges(string strPlaylistSelect = "", string strPlaylistName = "")
        {
            string strItemPath = HttpContext.Current.Session["curItemPath"].ToString().Replace(".lnk","");
            string strArtist = HttpContext.Current.Session["curArtistID"].ToString();
            string strRelease = HttpContext.Current.Session["curReleaseName"].ToString().Substring(12);
            string strTitle = Path.GetFileNameWithoutExtension(strItemPath).Substring(4);
            string strType = HttpContext.Current.Session["curPageID"].ToString();
            string strResult = "";

            //List population
            List<string> lstFields = new List<string>();
            List<string> lstValues = new List<string>();
            //Look for playlist
            DataTable dtPlaylists = ExtServices.GetRecordByValue("playlists", "plaName", strPlaylistName != "" ? strPlaylistName : "PLAYLIST_NOT_FOUND");

            //If playlist doesn't exist then create it
            if (strPlaylistName != "" && (dtPlaylists == null || (dtPlaylists != null && dtPlaylists.Rows.Count > 0 && dtPlaylists.Rows[0][2].ToString() != strType)))
            {
                List<string> lstFieldsPlaylist = new List<string>();
                List<string> lstValuesPlaylist = new List<string>();
                lstFieldsPlaylist.Add("plaName");
                lstValuesPlaylist.Add(strPlaylistName);
                lstFieldsPlaylist.Add("plaType");
                lstValuesPlaylist.Add(strType);
                ExtServices.InsertByTableName("playlists", lstFieldsPlaylist, lstValuesPlaylist);
                dtPlaylists = ExtServices.GetRecordByValue("playlists", "plaName", strPlaylistName);
                strPlaylistSelect = dtPlaylists.Rows[0][0].ToString();
                strResult = "Playlist \'" + strPlaylistName + "\' created. ";
            }
            //Look for title in playlist to avoid duplicates
            DataTable dtPlaylistData = ExtServices.GetRecordByTwoValues("playlistdata", "pldPath", strItemPath, "pldPlaylist", strPlaylistSelect, "pldID", "ASC");

            //If it doesnt exist in playlist, then add it
            if (dtPlaylistData == null || dtPlaylistData.Rows.Count == 0)
            {
                //Add entry to playlist
                lstFields.Add("pldTitle");
                lstValues.Add(strTitle);
                lstFields.Add("pldArtist");
                lstValues.Add(strArtist);
                lstFields.Add("pldRelease");
                lstValues.Add(strRelease);
                lstFields.Add("pldPath");
                lstValues.Add(strItemPath);
                lstFields.Add("pldPlaylist");
                lstValues.Add(strPlaylistSelect);

                ExtServices.InsertByTableName("playlistdata", lstFields, lstValues);
                strResult = strResult == "" ? strPlaylistName == "" ? "Track added to playlist." : "Track added to playlist" + strPlaylistName  + ".": strResult + "Track added successfully.";
            }

            else
            {
                strResult = strPlaylistName == "" ? "Track already exists in playlist." : "Track already exists in playlist '" + strPlaylistName + "'.";
            }

            return strResult;
        }
    }
}