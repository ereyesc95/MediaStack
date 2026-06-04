using ColorThiefDotNet;
using Hqub.MusicBrainz.API;
using Hqub.MusicBrainz.API.Entities;
using MediaBinger;
using Newtonsoft.Json.Linq;
using SpotifyAPI.Web;
using System;
using System.Collections;
using System.Collections.Generic;
using System.Data;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading.Tasks;
using System.Web;
using System.Web.Script.Serialization;
using System.Web.UI;
using System.Web.UI.WebControls;
using SpotifyAPI.Web.Http;
using URLs = SpotifyAPI.Web.SpotifyUrls;
using Newtonsoft.Json;
using System.Web.UI.HtmlControls;
using IF.Lastfm.Core.Api;
using System.Globalization;
using IWshRuntimeLibrary;
using Shell32;
using System.Web.Services;
using System.Drawing.Imaging;
using System.Text.RegularExpressions;
using System.Web.SessionState;
using System.Net.Http;
using System.Net.Http.Headers;

namespace Aoide.Forms
{
    public partial class SecondaryPage : System.Web.UI.Page
    {
        protected void Page_Load(object sender, EventArgs e)
        {
            Session["curPageName"] = Session["curPageName"] != null ? Session["curPageName"] : "";
            if (!IsPostBack)
            {
                switch (Session["curPageName"])
                {
                    case "Music":
                        try
                        {
                            MusicLoadAsync();
                        }
                        catch (Exception ex)
                        {
                            string strError = ex.ToString();
                        }
                        break;
                    default:
                        break;
                }
            }

        }

        private async Task MusicLoadAsync()
        {
            DataTable dtMenuItems = ExtServices.GetRecordByValue("menuitems", " meiFKcontenttype", Session["curSubPageCode"].ToString(), "meiOrder");

            //Menu items population
            if (dtMenuItems != null && dtMenuItems.Rows.Count > 0)
            {
                string strActive = " activeSec";
                DataTable dtMenuFilters = ExtServices.GetRecordByValue("filters", "filFKcontenttype", Session["curSubPageCode"].ToString(), "filOrder");
                if (dtMenuFilters != null)
                {
                    //Loop for each main menu item
                    char charInitialCharArtist = HttpContext.Current.Session["curArtistName"].ToString().ToString().ToUpper()[0];
                    charInitialCharArtist = Char.IsDigit(charInitialCharArtist) ? '#' : Char.IsSymbol(charInitialCharArtist) ? '' : charInitialCharArtist;
                    HttpContext.Current.Session["curArtistInitial"] = charInitialCharArtist;
                    string strRootArtPath = HttpContext.Current.Session["currentDisk"].ToString() + "/" + HttpContext.Current.Session["curPageName"] + "/" + HttpContext.Current.Session["curArtistInitial"]?.ToString() + "/" + HttpContext.Current.Session["curArtistName"].ToString();
                    string[] strArtfolders = Directory.GetDirectories(strRootArtPath, "*", SearchOption.TopDirectoryOnly);
                    int intCountBarBut = strArtfolders.Count() + 1;
                    for (int i = 0; i < dtMenuItems.Rows.Count; i++)
                    {
                        bool containsAudio = strArtfolders.Any(path => Path.GetFileName(path).Contains(dtMenuItems.Rows[i][1].ToString()));
                        if (!containsAudio && dtMenuItems.Rows[i][1].ToString() != "Overview")
                        {
                            continue;
                        }

                        barNavSection.InnerHtml = barNavSection.InnerHtml + " <a id='menuItem" + i + "' class='menuBarButtonSec menuOption" + strActive + "' href='javascript:void(0)' data-value='" + dtMenuItems.Rows[i][0] + "' style='min-width:" + 100 / intCountBarBut + "%' runat='server'>" + dtMenuItems.Rows[i][1].ToString().ToUpper() + "</a>";
                        filterBarSection.InnerHtml = filterBarSection.InnerHtml + "<div id='filterItem" + i + "' class='divSubitem divSubitem" + dtMenuItems.Rows[i]["meiID"].ToString() + "' data-value='" + dtMenuItems.Rows[i]["meiID"].ToString() + "' >";
                        //Filter DataTable
                        int intCountSubItems = dtMenuFilters.Select().Where(s => s["filFKmenuitems"].ToString() == dtMenuItems.Rows[i]["meiID"].ToString()).Count();
                        //Loop for each main menu filter
                        for (int j = 0; j < dtMenuFilters.Rows.Count; j++)
                        {
                            //If filter belongs to menu item
                            if (dtMenuFilters.Rows[j]["filFKmenuitems"].ToString() == dtMenuItems.Rows[i]["meiID"].ToString())
                            {
                                filterBarSection.InnerHtml = filterBarSection.InnerHtml + "<a id='filterSubItem" + dtMenuFilters.Rows[j]["filID"].ToString() + "' class='menuSubItemSec " + strActive + "' href='javascript:void(0)' data-id='" + dtMenuFilters.Rows[j]["filID"].ToString() + "' data-parent='" + dtMenuFilters.Rows[j]["filFKMenuItems"].ToString() + "' data-table='" + dtMenuFilters.Rows[j]["filParentTable"].ToString() + "' data-field='" + dtMenuFilters.Rows[j]["filParentField"].ToString() + "' data-type='" + dtMenuFilters.Rows[j]["filDataType"].ToString() + "' style='min-width:" + 100 / intCountSubItems + "%'>" + dtMenuFilters.Rows[j]["filName"].ToString().ToUpper() + "</a>";
                                strActive = "";
                            }
                        }
                        filterBarSection.InnerHtml = filterBarSection.InnerHtml + "</div>";
                    }
                }
            }

            else
            {
                // If no content found
                contentSection.InnerHtml = "<p>No content found yet</p>";

            }

            //Validate url data
            string strArtID = Session["curArtistID"]?.ToString().Replace(" ","");
            string strCurrentItem = Session["curArtistName"].ToString();
            string strCurrentID = Session["curArtistCode"].ToString();
            if (strCurrentID == "0")
            {
                DataTable dtBandData = ExtServices.GetRecordByValue("bands", " bndName", Session["curArtistName"].ToString());
                if (dtBandData != null && dtBandData.Rows.Count > 0)
                {
                    strArtID = dtBandData.Rows[0][0].ToString();
                    strCurrentID = dtBandData.Rows[0][2].ToString();
                    Session["curArtistCode"] = strCurrentID;
                    Session["curArtistID"] = dtBandData.Rows[0][0].ToString();
                    for (int i = 0; i < 16; i++)
                    {
                        HttpContext.Current.Session["playlist" + i + "ID" + strArtID] = "";
                    }
                }
            }
            bndName.Value = strCurrentItem;
            bndID.Value = strCurrentID;

            string strCurrentUrl = HttpContext.Current.Request.Url.AbsoluteUri;

            string myDecodedString = Uri.UnescapeDataString(strCurrentUrl);
            string strCurrentUrlItem = myDecodedString.Split('/').Last();

            if (strCurrentItem.ToLower() != strCurrentUrlItem.ToLower())
            {
                //Get ID of new item
                //Updated from clicking othe artist
                DataTable dtData = new DataTable();
                if (Session["curModifiedOrigin"].ToString() != "" && Session["curModifiedOrigin"].ToString() == "_Link_Click")
                {
                    dtData = ExtServices.GetRecordByValue("bands", " bndName", strCurrentItem);

                }
                //Updated from changing url
                else
                {
                    dtData = ExtServices.GetRecordByValue("bands", " bndName", strCurrentUrlItem);
                }

                Session["curArtistID"] = dtData.Rows[0][0].ToString();
                strArtID = dtData.Rows[0][0].ToString();
                for (int i = 0; i < 16; i++)
                {
                    HttpContext.Current.Session["playlist" + i + "ID" + strArtID] = "";
                }

                //If found then update session variables
                if (dtData != null && dtData.Rows.Count > 0 && dtData.Rows[0][2].ToString() != "")
                {
                    Session["curArtistName"] = dtData.Rows[0][1].ToString();
                    Session["curArtistCode"] = dtData.Rows[0][2].ToString();
                    strCurrentItem = Session["curArtistName"].ToString();
                    strCurrentID = Session["curArtistCode"].ToString();

                    testString.InnerText = strCurrentItem;
                    testID.InnerText = strCurrentID;
                }
                else
                {
                    testString.InnerText = "NOT FOUND";
                    testID.InnerText = "NOT FOUND";
                }
            }
            Session["curModifiedOrigin"] = "";
            DataTable dtBand = ExtServices.GetRecordByValue("bands", " bndCode", Session["curArtistCode"].ToString());
            string strPosterPath = "";
            string strWallPath = "";
            List<string> lstDirectories = new List<string>();
            List<string> lstPosters = new List<string>();
            List<string> lstWalls = new List<string>();
            List<string> lstPaths = new List<string>();
            char charInitialCharBnd = dtBand.Rows[0][1].ToString().ToUpper()[0];
            charInitialCharBnd = Char.IsDigit(charInitialCharBnd) ? '#' : Char.IsSymbol(charInitialCharBnd) ? '' : charInitialCharBnd;
            //Retrieve image for left side
            if (dtBand != null && Directory.Exists(HttpContext.Current.Session["currentDisk"].ToString() + "/" + HttpContext.Current.Session["curPageName"] + "/" + charInitialCharBnd + "/" + dtBand.Rows[0][1].ToString() + "/Gallery/Photos"))
            {
                //Get directories
                string[] strDirectories = Directory.GetDirectories(HttpContext.Current.Session["currentDisk"].ToString() + "/" + HttpContext.Current.Session["curPageName"] + "/" + charInitialCharBnd + "/" + dtBand.Rows[0][1].ToString());

                Array.Sort(strDirectories);
                string strDirectoryNames = "";

                foreach (string directory in strDirectories)
                {
                    strDirectoryNames = strDirectoryNames == "" ? directory.Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/" + HttpContext.Current.Session["curPageName"] + "/" + charInitialCharBnd + "/" + dtBand.Rows[0][1].ToString(), "") : strDirectoryNames + ";" + directory.Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/" + HttpContext.Current.Session["curPageName"] + "/" + charInitialCharBnd + "/" + dtBand.Rows[0][1].ToString(), "");
                }

                //strDirectoryNames = strDirectoryNames + ";\\12. Promo Material [Video]";
                subMenuItems.Value = strDirectoryNames;
                string[] files = Directory.GetFiles(HttpContext.Current.Session["currentDisk"].ToString() + "/" + HttpContext.Current.Session["curPageName"] + "/" + charInitialCharBnd + "/" + dtBand.Rows[0][1].ToString() + "/Gallery/Photos").Where(val => val.Contains("00. ") && !val.Contains("_small.")).ToArray();
                files = files?.OrderByDescending(c => c).ToArray();
                lstPosters = files?.Where(item => item.Contains("_V")).Select(item => item.Replace("'", "%27")).ToList();
                lstWalls = files?.Where(item => item.Contains("_H")).Select(item => item.Replace("'", "%27")).ToList();
                string strFileName = Path.GetFileName(lstPosters?.FirstOrDefault()?.Replace("'", "%27"));
                strPosterPath = lstPosters.Count() > 0 ? Uri.EscapeDataString(lstPosters?.FirstOrDefault()?.Replace("\\", "/"))?.Replace("%2F", "/").Replace("%3A", ":").Replace(HttpContext.Current.Session["currentDisk"].ToString(), HttpContext.Current.Session["currentServer"].ToString()) : "/Images/System/poster_V.jpg";
                strWallPath = lstWalls.Count() > 0 ? Uri.EscapeDataString(lstWalls?.FirstOrDefault()?.Replace("\\", "/"))?.Replace("%2F", "/").Replace("%3A", ":").Replace(HttpContext.Current.Session["currentDisk"].ToString(), HttpContext.Current.Session["currentServer"].ToString()) : "/Images/System/poster_H.jpg";
                if (strFileName != "" && files.Count() > 0)
                {
                    divContainerLeft.Attributes.Add("title", dtBand.Rows[0][1].ToString() + ", " + strFileName.Substring(0, 4));
                }
                    
                divContainerLeft.Attributes.Add("style", "background-image: url('" + strPosterPath + "')");
                bodySecondPage.Attributes.Add("style", "background-image: url('" + strWallPath + "')");
                lstPosters = lstPosters?.Select(item => Path.GetFileName(item).Replace("'", "%27")).ToList();
                lstWalls = lstWalls?.Select(item => Path.GetFileName(item).Replace("'", "%27")).ToList();
            }

            //Top logo
            string strEncodedNameBand = dtBand != null ? Uri.UnescapeDataString(dtBand.Rows[0][1].ToString()) : "";
            char charInitialChar = strEncodedNameBand.ToUpper()[0];
            Session["curArtistInitial"] = Char.IsDigit(charInitialChar) ? '#' : Char.IsSymbol(charInitialChar) ? '' : charInitialChar;

            string strRenderPath = HttpContext.Current.Session["currentDisk"].ToString() + "/" + HttpContext.Current.Session["curPageName"] + "/" + HttpContext.Current.Session["curArtistInitial"].ToString() + "/" + strEncodedNameBand + "/Gallery/Logos";
            string[] strRenderPaths = Directory.Exists(strRenderPath) ? Directory.GetFiles(strRenderPath, "*.png") : null;
            Array.Sort(strRenderPaths);
            List<string> lstLogos = strRenderPaths?.Where(item => item.Contains("Logo [")).Select(item => item.Replace("'", "%27")).ToList();
            List<string> lstIcons = strRenderPaths?.Where(item => item.Contains("Icon [")).Select(item => item.Replace("'", "%27")).ToList();
            string strLogoPath = lstLogos.Count() > 0 ? Uri.EscapeDataString(lstLogos?.Where(item => item.Contains("Current"))?.FirstOrDefault()?.Replace("\\", "/"))?.Replace("%2F", "/").Replace("%3A", ":").Replace(HttpContext.Current.Session["currentDisk"].ToString(), HttpContext.Current.Session["currentServer"].ToString())
                : Uri.EscapeDataString(lstLogos?.FirstOrDefault()?.Replace("\\", "/"))?.Replace("%2F", "/").Replace("%3A", ":").Replace(HttpContext.Current.Session["currentDisk"].ToString(), HttpContext.Current.Session["currentServer"].ToString());
            string strIconPath = "";
            try
            {
                strIconPath = lstIcons.Count() > 0 ? Uri.EscapeDataString(lstIcons?.Where(item => item.Contains("Current"))?.FirstOrDefault()?.Replace("\\", "/"))?.Replace("%2F", "/").Replace("%3A", ":").Replace(HttpContext.Current.Session["currentDisk"].ToString(), HttpContext.Current.Session["currentServer"].ToString())
                : Uri.EscapeDataString(lstLogos?.FirstOrDefault()?.Replace("\\", "/"))?.Replace("%2F", "/").Replace("%3A", ":").Replace(HttpContext.Current.Session["currentDisk"].ToString(), HttpContext.Current.Session["currentServer"].ToString());
            }
            catch (Exception ex)
            {
            }

            if (strIconPath == "" || !strIconPath.Contains("Icon"))
                iconTop.Attributes.Add("style", "display: none");
            iconTop.Src = strIconPath;
            logoTop.Src = strLogoPath;
            artistNameTop.InnerText = strEncodedNameBand;
            lstLogos = lstLogos?.Select(item => Path.GetFileName(item).Replace("'", "%27")).ToList();
            lstIcons = lstIcons?.Select(item => Path.GetFileName(item).Replace("'", "%27")).ToList();
            lstPaths.Add("http://127.0.0.1:8887/" + HttpContext.Current.Session["curPageName"] + "/" + HttpContext.Current.Session["curArtistInitial"].ToString() + "/" + strEncodedNameBand + "/Gallery/Photos/");
            lstPaths.Add("http://127.0.0.1:8887/" + HttpContext.Current.Session["curPageName"] + "/" + HttpContext.Current.Session["curArtistInitial"].ToString() + "/" + strEncodedNameBand + "/Gallery/Logos/");
            //File names field population
            txtLogos.Value = string.Join(";", lstLogos.ToArray().Select(p => p.ToString()).ToArray());
            txtIcons.Value = string.Join(";", lstIcons.ToArray().Select(p => p.ToString()).ToArray());
            txtPosters.Value = string.Join(";", lstPosters.ToArray().Select(p => p.ToString()).ToArray());
            txtWalls.Value = string.Join(";", lstWalls.ToArray().Select(p => p.ToString()).ToArray());
            txtPaths.Value = string.Join(";", lstPaths.ToArray().Select(p => p.ToString()).ToArray());
            imgTitle.Value = strEncodedNameBand;

            //URL
            string[] strURLs = dtBand.Rows[0][12].ToString().Split(';');
            string strSpotifyID = "";
            string strWikiID = "";
            int intCountURL = 0;
            string strContentURL = "<span runat='server' id='spanBndURL' class='spanBndLabel modalSpanSecond'>Websites: </span><a runat='server' id='bndAddUrl' class='btn btn-mini' title='Add' style='color: aliceblue; opacity: 0.4' href='javascript: void(0)'><i class='fa fa-plus' aria-hidden='true'></i></a>";
            foreach (string url in strURLs)
            {
                strContentURL = strContentURL + "<input runat='server' id='BndGenreURL_" + intCountURL + "' type='text' class='form-control inputFieldTertiary dark-mode-secondary-page bndDataField bndURLField bndURL' placeholder='URL' value='" + url.Replace("■", ": ").Replace("[", "").Replace("]", "") + "'/>";
                if (url.Contains("spotify"))
                {
                    strSpotifyID = url.Split('/').Last();
                    strSpotifyID = strSpotifyID.Remove(strSpotifyID.Length - 1);
                }
                else if (url.Contains("wikipedia"))
                {
                    strWikiID = url.Split('/').Last();
                    strWikiID = strWikiID.Remove(strWikiID.Length - 1);
                }
                intCountURL++;
            }

            bndLineURL.InnerHtml = strContentURL;

            //Artist playlists //string[] strPlaylistLogos = Directory.GetFiles(HttpContext.Current.Server.MapPath("~/Images/Logos/"));
            DataTable dtPlaylistArtist = ExtServices.GetRecordByValue("playlists", " plaType", "201");
            string strPlaylistNames = "";
            string strPlaylistIDs = "";
            if (dtPlaylistArtist != null && dtPlaylistArtist.Rows.Count > 0)
            {
                for (int i = 0; i < dtPlaylistArtist.Rows.Count; i++)
                {
                    strPlaylistIDs = strPlaylistIDs == "" ? dtPlaylistArtist.Rows[i][0].ToString(): strPlaylistIDs + "■" + dtPlaylistArtist.Rows[i][0].ToString();
                    strPlaylistNames = strPlaylistNames == "" ? dtPlaylistArtist.Rows[i][1].ToString(): strPlaylistNames + "■" + dtPlaylistArtist.Rows[i][1].ToString();
                }
            }

            HttpContext.Current.Session["playlistIDs"] = strPlaylistIDs;
            HttpContext.Current.Session["playlistNames"] = strPlaylistNames;
            
            for (int i = 0; i < 12; i++)
            {
                HttpContext.Current.Session["playlist" + i + "ID" + strArtID] = HttpContext.Current.Session["playlist" + i + "ID" + strArtID] == null ? "" : HttpContext.Current.Session["playlist" + i + "ID" + strArtID];
            }

            //Writing credits in other artist releases
            DataTable dtArtistParticipationsWriting = ExtServices.GetRecordById("artistparticipations", " arpFKbands", Convert.ToInt32(dtBand.Rows[0][0].ToString()));
            string strArtistParticipationIDs = "";
            string strArtistParticipationIDWriting = "";
            if (dtArtistParticipationsWriting!= null && dtArtistParticipationsWriting.Rows.Count > 0)
            {
                int[] intWriterIDs = dtArtistParticipationsWriting.AsEnumerable().Select(row => row.Field<int>("arpFKartists")).Distinct().ToArray();
                strArtistParticipationIDs = string.Join(",", intWriterIDs);
                strArtistParticipationIDWriting =  "{" + string.Join("}|{", intWriterIDs) + "}";
            }
            
            if (strArtistParticipationIDs != "")
            {
                DataTable dtParticipationsById = ExtServices.GetRecordByValueList("artistparticipations", "arpFKartists", strArtistParticipationIDs, "arpFKbands");
                if (dtParticipationsById != null && dtParticipationsById.Rows.Count > 0 && (HttpContext.Current.Session["playlist15" + "ID" + strArtID] == null || HttpContext.Current.Session["playlist15" + "ID" + strArtID].ToString() == "") )
                {
                    string[] lstBandParticipationIDs = dtParticipationsById.AsEnumerable().Select(row => row.Field<int>("arpFKbands").ToString()).Distinct().ToArray();
                    //Exclude various artists
                    lstBandParticipationIDs = lstBandParticipationIDs.Append("120").ToArray();

                    DataTable dtWritingCredits = ExtServices.GetRecordByValuesRegExp("releases", "relFKwriters", strArtistParticipationIDWriting.Replace("{", @"\\{").Replace("}", @"\\}"), "relFKbands");
                    DataTable dtPWritingCreditsFiltered = dtWritingCredits;
                    var rowsToRemove = dtWritingCredits?.AsEnumerable().Where(row => lstBandParticipationIDs.Contains(row.Field<string>("relFKbands"))).ToList();
                    if (rowsToRemove != null && dtWritingCredits != null)
                    {
                        foreach (var row in rowsToRemove)
                            row.Delete();
                        dtWritingCredits.AcceptChanges();
                    }
                    
                    List<string> lstTribArtistIDs = dtWritingCredits?.AsEnumerable().Select(row => row.Field<string>("relFKbands")).Distinct().ToList();
                    DataTable dtTribBandIds = lstTribArtistIDs != null && lstTribArtistIDs.Count > 0 ? ExtServices.GetRecordByValueList("bands", "bndID", string.Join(",", lstTribArtistIDs)) : new DataTable();
                    if (dtPWritingCreditsFiltered != null && dtPWritingCreditsFiltered.Rows.Count > 0)
                    {                        
                        string[] strArtistParticipationIDWritingArr = strArtistParticipationIDWriting.Split('|');
                        List<string> lstStoredReleases = new List<string>();
                        for (int i = 0; i < dtWritingCredits.Rows.Count; i++)
                        {
                            if (dtWritingCredits.Rows[i][13].ToString() != "")
                            {
                                string[] strCurrentWritingCredits = dtWritingCredits.Rows[i][13].ToString().Split('■');
                                string[] strTrackNames = strCurrentWritingCredits?.Where(value => !string.IsNullOrEmpty(value)).Select(item => Regex.Match(item, @"~(.*?)~").Groups[1].Value.Replace("%36", "'").Replace("▀", "'")).ToArray();
                                string strTribBandName = dtTribBandIds.AsEnumerable().Where(row => row.Field<int>("bndId").ToString() == dtWritingCredits.Rows[i][3].ToString()).Select(row => row.Field<string>(1)).FirstOrDefault();
                                char charInitialCharTrib = strTribBandName.ToUpper()[0];
                                charInitialCharTrib = Char.IsDigit(charInitialCharTrib) ? '#' : Char.IsSymbol(charInitialCharTrib) ? '' : charInitialCharTrib;
                                string strReleasePath = HttpContext.Current.Session["currentDisk"].ToString() + "/Music/" + charInitialCharTrib + "/" + strTribBandName;
                                string[] strMatchingTracks = Directory.Exists(strReleasePath) ? Directory.GetFiles(strReleasePath, "*.mp3", SearchOption.AllDirectories).Where(file => strTrackNames.Any(element => Path.GetFileNameWithoutExtension(file).Contains(element)) && !file.ToLower().Contains(dtBand.Rows[0][1].ToString().ToLower().Replace("%36", "'").Replace("█", "'") + " cover")).ToArray() : null;
                                if (strMatchingTracks != null && strMatchingTracks.Length > 0)
                                {
                                    Array.Sort(strMatchingTracks);
                                    foreach (string strTrack in strMatchingTracks)
                                        lstStoredReleases.Add("^" + dtWritingCredits.Rows[i][3].ToString() + "^" + Path.GetFileNameWithoutExtension(strTrack).Substring(4));
                                }
                            }
                        }
                        if (lstStoredReleases.Count > 0)
                        {
                            string strSessionWriting = lstStoredReleases.Aggregate((a, b) => a + "|" + b);
                            HttpContext.Current.Session["playlist15" + "ID" + strArtID] = strSessionWriting;
                        }
                    }
                }
            }
            //Covers & Features
            DataTable dtReleasesPlaylists = ExtServices.GetRecordByValue("releases", "relFKbands", dtBand.Rows[0][0].ToString());
            string strCoversPlaylist = "";
            string strFeaturesPlaylist = "";
            if (dtReleasesPlaylists != null && dtReleasesPlaylists.Rows.Count > 0 && (HttpContext.Current.Session["playlist6" + "ID" + strArtID] == null || HttpContext.Current.Session["playlist6" + "ID" + strArtID].ToString() == ""))
            {
                for (int i = 0; i < dtReleasesPlaylists.Rows.Count; i++)
                {
                    if (dtReleasesPlaylists.Rows[i][14].ToString() != "")
                    {
                        strFeaturesPlaylist = strFeaturesPlaylist == "" ? dtReleasesPlaylists.Rows[i][14].ToString() : strFeaturesPlaylist + "■" + dtReleasesPlaylists.Rows[i][14].ToString();
                    }
                    if (dtReleasesPlaylists.Rows[i][15].ToString() != "")
                    {
                        strCoversPlaylist = strCoversPlaylist == "" ? dtReleasesPlaylists.Rows[i][15].ToString() : strCoversPlaylist + "■" + dtReleasesPlaylists.Rows[i][15].ToString();
                    }
                }
                HttpContext.Current.Session["playlist8" + "ID" + strArtID] = strFeaturesPlaylist;
                HttpContext.Current.Session["playlist6" + "ID" + strArtID] = strCoversPlaylist;
            }

            //Collaborations
            string strParticipationsAndBandID = "{" + strArtistParticipationIDs.Replace(",", "}|{") + "|{" + dtBand.Rows[0][0].ToString() + "_bnd}";
            DataTable dtCollaborationsPlaylist = ExtServices.GetRecordByValuesRegExp("releases", "relFKfeatures", strParticipationsAndBandID.Replace("{", @"\\{").Replace("}", @"\\}"), "relFKbands");
            string strCollaborationsPlaylist = "",  strFinalCollabs = "";
            if (dtCollaborationsPlaylist != null && dtCollaborationsPlaylist.Rows.Count > 0 && (HttpContext.Current.Session["playlist5" + "ID" + strArtID] == null || HttpContext.Current.Session["playlist12" + "ID" + strArtID]?.ToString() == ""))
            {
                for (int i = 0; i < dtCollaborationsPlaylist.Rows.Count; i++)
                {
                    if (dtCollaborationsPlaylist.Rows[i][14].ToString() != "")
                    {
                        strCollaborationsPlaylist = strCollaborationsPlaylist == "" ? dtCollaborationsPlaylist.Rows[i][14].ToString() : strCollaborationsPlaylist + "■" + dtCollaborationsPlaylist.Rows[i][14].ToString();
                    }
                    if (strCollaborationsPlaylist != "")
                    {
                        string[] strCollabsArray = strCollaborationsPlaylist.Split('■');
                        foreach (string strCollab in strCollabsArray)
                        {
                            if (strCollab.Contains(HttpContext.Current.Session["curArtistID"].ToString().Replace(" ","") + "_bnd"))
                            {
                                strFinalCollabs = strFinalCollabs == "" ? strCollab + "^" + dtCollaborationsPlaylist.Rows[i][3] + "^" : strFinalCollabs + "■" + strCollab + "^" + dtCollaborationsPlaylist.Rows[i][3] + "^";
                            }
                        }
                    }
                }
                HttpContext.Current.Session["playlist5" + "ID" + strArtID] = strFinalCollabs.Replace("#",",");
            }

            //Tributes
            DataTable dtTributesPlaylist = ExtServices.GetRecordByValuesRegExp("releases", "relFKcovers", strParticipationsAndBandID.Replace("{", @"\\{").Replace("}", @"\\}"), "relFKbands");
            string strTributesPlaylist = "";
            if (dtTributesPlaylist != null && dtTributesPlaylist.Rows.Count > 0 && (HttpContext.Current.Session["playlist14" + "ID" + strArtID] == null || HttpContext.Current.Session["playlist14" + "ID" + strArtID].ToString() == ""))
            {
                for (int i = 0; i < dtTributesPlaylist.Rows.Count; i++)
                {
                    if (dtTributesPlaylist.Rows[i][15].ToString() != "")
                    {
                        strTributesPlaylist = strTributesPlaylist == "" ? "^" + dtTributesPlaylist.Rows[i][3].ToString() +"^" + dtTributesPlaylist.Rows[i][15].ToString() : strTributesPlaylist + "|^" + dtTributesPlaylist.Rows[i][3].ToString() + "^" + dtTributesPlaylist.Rows[i][15].ToString();
                    }
                }
                HttpContext.Current.Session["playlist14" + "ID" + strArtID] = strTributesPlaylist;
            }

            //Acoustic, Remixes, Demos
            string[] dirs = Directory.GetDirectories(HttpContext.Current.Session["currentDisk"].ToString() + "/Music/" + charInitialCharBnd + "/" + dtBand.Rows[0][1].ToString(), "*", SearchOption.AllDirectories);
            Array.Sort(dirs);
            string strAcousticsPlaylist = "";
            string strAcappellasPlaylist = "";
            string strInstrumentalsPlaylist = "";
            string strRemixPlaylist = "";
            string strDemosPlaylist = "";
            
            if (dirs != null && dirs.Length > 0 && (HttpContext.Current.Session["playlist9" + "ID" + strArtID] == null || HttpContext.Current.Session["playlist9" + "ID" + strArtID].ToString() == ""))
            {
                foreach (string dir in dirs)
                {
                    string[] alltracks = Directory.GetFiles(dir, "*.mp3", SearchOption.AllDirectories);
                    string[] allAcoustics= alltracks.Where(x => x.Contains("[") && x.Contains("[") && x.ToLower().Contains("[acoustic")).ToArray();
                    string[] allACappellas= alltracks.Where(x => x.Contains("[") && x.Contains("[") && x.ToLower().Contains("a cappella")).ToArray();
                    string[] allInstrumentals= alltracks.Where(x => x.Contains("[") && x.Contains("[") && x.ToLower().Contains("instrumental")).ToArray();
                    string[] allRemixes = alltracks.Where(x => x.Contains("[") && x.Contains("[") && (x.Contains(" Mix") || x.Contains(" Remix"))).ToArray();
                    string[] allDemos = alltracks.Where(x => x.Contains("[") && x.Contains("[") && (x.ToLower().Contains(" demo ") || x.Contains("Demo ") || x.Contains("Demo]") || x.Contains("Demo;"))).ToArray();

                    Array.Sort(alltracks);
                    Array.Sort(allAcoustics);
                    Array.Sort(allACappellas);
                    Array.Sort(allInstrumentals);
                    Array.Sort(allRemixes);
                    Array.Sort(allDemos);

                    for (int i = 0; i < allAcoustics.Length; i++)
                    {
                        if (!strAcousticsPlaylist.Contains(Path.GetFileName(allAcoustics[i])))
                        {
                            strAcousticsPlaylist = strAcousticsPlaylist == "" ? Path.GetFileName(allAcoustics[i]) : strAcousticsPlaylist + "■" + Path.GetFileName(allAcoustics[i]);
                        }
                    }

                    for (int i = 0; i < allACappellas.Length; i++)
                    {
                        if (!strAcappellasPlaylist.Contains(Path.GetFileName(allACappellas[i])))
                        {
                            strAcappellasPlaylist = strAcappellasPlaylist == "" ? Path.GetFileName(allACappellas[i]) : strAcappellasPlaylist + "■" + Path.GetFileName(allACappellas[i]);
                        }
                    }
                    for (int i = 0; i < allInstrumentals.Length; i++)
                    {
                        if (!strInstrumentalsPlaylist.Contains(Path.GetFileName(allInstrumentals[i])))
                        {
                            strInstrumentalsPlaylist = strInstrumentalsPlaylist == "" ? Path.GetFileName(allInstrumentals[i]) : strInstrumentalsPlaylist + "■" + Path.GetFileName(allInstrumentals[i]);
                        }
                    }
                    for (int i = 0; i < allRemixes.Length; i++)
                    {
                        if (!strRemixPlaylist.Contains(Path.GetFileName(allRemixes[i])))
                        {
                            strRemixPlaylist = strRemixPlaylist == "" ? Path.GetFileName(allRemixes[i]) : strRemixPlaylist + "■" + Path.GetFileName(allRemixes[i]);
                        }
                    }
                    for (int i = 0; i < allDemos.Length; i++)
                    {
                        if (!strDemosPlaylist.Contains(Path.GetFileName(allDemos[i])))
                        {
                            strDemosPlaylist = strDemosPlaylist == "" ? Path.GetFileName(allDemos[i]) : strDemosPlaylist + "■" + Path.GetFileName(allDemos[i]);
                        }
                    }
                }
                HttpContext.Current.Session["playlist0" + "ID" + strArtID] = strAcappellasPlaylist;
                HttpContext.Current.Session["playlist9" + "ID" + strArtID] = strInstrumentalsPlaylist;
                HttpContext.Current.Session["playlist1" + "ID" + strArtID] = strAcousticsPlaylist;
                HttpContext.Current.Session["playlist10" + "ID" + strArtID] = strRemixPlaylist;
                HttpContext.Current.Session["playlist7" + "ID" + strArtID] = strDemosPlaylist;
            }

            //Standalones playlist
            string strStandalonePlaylist = "", strBSidePlaylist = "";
            string strSinglesRootPath = HttpContext.Current.Session["currentDisk"].ToString() + "/Music/" + charInitialCharBnd + "/" + dtBand.Rows[0][1].ToString() + "/Audio/Singles";
            if (Directory.Exists(strSinglesRootPath) && (HttpContext.Current.Session["playlist12" + "ID" + strArtID] == null || HttpContext.Current.Session["playlist12" + "ID" + strArtID].ToString() == ""))
            {
                var mp3Files = new List<string>();

                // Regex to match date-like folder names (e.g. 2023.01.13.)
                Regex datePattern = new Regex(@"\b\d{4}\.\d{2}\.\d{2}\b");

                foreach (var folder in Directory.GetDirectories(strSinglesRootPath))
                {
                    var subfolders = Directory.GetDirectories(folder);
                    bool isReleaseFolder = subfolders.Any(sub => datePattern.IsMatch(Path.GetFileName(sub)));

                    if (!isReleaseFolder)
                    {
                        var files = Directory.GetFiles(folder, "*.mp3", SearchOption.AllDirectories)
                                             .OrderBy(f => f) // Optional: sort alphabetically
                                             .ToList();

                        if (files.Count > 0)
                        {
                            // Always keep the first file
                            mp3Files.Add(files[0].Replace('\\', '/'));

                            // Add the rest only if they don't contain '['
                            foreach (var file in files.Skip(1))
                            {
                                if (!Path.GetFileName(file).Contains("["))
                                {
                                    mp3Files.Add(file.Replace('\\', '/'));
                                }
                            }
                        }
                    }
                }

                // Output results
                foreach (var file in mp3Files)
                {
                    strStandalonePlaylist = strStandalonePlaylist == "" ? Path.GetFileName(file) : strStandalonePlaylist + "■" + Path.GetFileName(file);
                }

                HttpContext.Current.Session["playlist12" + "ID" + strArtID] = strStandalonePlaylist;
            }

            //B-sides playlist
            if (Directory.Exists(strSinglesRootPath) && (HttpContext.Current.Session["playlist4" + "ID" + strArtID] == null || HttpContext.Current.Session["playlist4" + "ID" + strArtID].ToString() == ""))
            {
                var allMp3Paths = Directory.GetFiles(strSinglesRootPath, "*.mp3", SearchOption.AllDirectories);

                var filteredPaths = allMp3Paths.Where(path =>
                {
                    string fileName = Path.GetFileNameWithoutExtension(path);
                    string parentFolder = new DirectoryInfo(Path.GetDirectoryName(path)).Name;

                    // Remove if filename matches folder name (main release)
                    return !fileName.Equals(parentFolder, StringComparison.OrdinalIgnoreCase);
                }).ToArray();

                Array.Sort(filteredPaths);

                // Output results
                foreach (var file in filteredPaths)
                {
                    string strFilePath = file.Replace("\\", "/");
                    strBSidePlaylist = strBSidePlaylist == "" ? Path.GetFileName(strFilePath) : strBSidePlaylist + "■" + Path.GetFileName(strFilePath);
                }

                HttpContext.Current.Session["playlist4" + "ID" + strArtID] = strBSidePlaylist;
            }

            //Bonus tracks playlist
            string strBonusPlaylist = "";
            string strAudioRootPath = HttpContext.Current.Session["currentDisk"].ToString() + "/Music/" + charInitialCharBnd + "/" + dtBand.Rows[0][1].ToString() + "/Audio";
            if (Directory.Exists(strAudioRootPath) && (HttpContext.Current.Session["playlist3" + "ID" + strArtID] == null || HttpContext.Current.Session["playlist3" + "ID" + strArtID].ToString() == ""))
            {
                string[] targetFolders = { "Albums", "Extended Plays" };

                var validPaths = new List<string>();

                foreach (var folder in targetFolders)
                {
                    string fullPath = Path.Combine(strAudioRootPath, folder);
                    if (!Directory.Exists(fullPath)) continue;

                    var mp3Files = Directory.GetFiles(fullPath, "*.mp3", SearchOption.AllDirectories);
                    Array.Sort(mp3Files);
                    foreach (var path in mp3Files)
                    {
                        string strPath = path.Replace("\\", "/");
                        string[] segments = strPath.Split('/');
                        if (segments.Length < 6) continue;

                        string editionFolder = segments[segments.Length - 2];
                        string releaseFolder = segments[segments.Length - 3];

                        // ✅ Condition 2: Edition folder must NOT be "Standard Edition"
                        if (editionFolder.Contains(" Standard Edition") || segments.Length == 8) continue;

                        // ✅ Condition 3: File name must not contain brackets unless it's a valid cover
                        string fileName = Path.GetFileNameWithoutExtension(strPath);

                        if (fileName.Contains("["))
                        {
                            var bracketContentMatch = Regex.Match(fileName, @"\[(.*?)\]");
                            if (bracketContentMatch.Success)
                            {
                                string content = bracketContentMatch.Groups[1].Value;

                                // Allow only covers without semicolons
                                if (!content.Contains(" cover") || content.Contains(";"))
                                    continue;
                            }
                            else
                            {
                                continue;
                            }
                        }

                        validPaths.Add(strPath);
                    }
                }

                // Output result
                foreach (var file in validPaths)
                {
                    string strFilePath = file.Replace("\\", "/");
                    strBonusPlaylist = strBonusPlaylist == "" ? Path.GetFileName(strFilePath) : strBonusPlaylist + "■" + Path.GetFileName(strFilePath);
                }

                HttpContext.Current.Session["playlist3" + "ID" + strArtID] = strBonusPlaylist;
            }
            //Setlist playlist
            if (Directory.Exists(strAudioRootPath) && (HttpContext.Current.Session["playlist11" + "ID" + strArtID] == null || HttpContext.Current.Session["playlist11" + "ID" + strArtID].ToString() == ""))
            {
                DataTable dtAuth = ExtServices.GetRecordByValue("apiauth", "apiName", "Setlist.fm");
                if (dtAuth != null && dtAuth.Rows.Count > 0 && dtAuth.Rows[0][2].ToString() != "" && dtBand.Rows[0][2].ToString() != "")
                {
                    string apiKey = dtAuth.Rows[0][2].ToString();
                    string artistMbid = dtBand.Rows[0][2].ToString();
                    var baseUrl = $"https://api.setlist.fm/rest/1.0/artist/{artistMbid}/setlists";

                    try
                    {
                        var client = new HttpClient();
                        client.DefaultRequestHeaders.Add("x-api-key", apiKey);
                        client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
                        client.DefaultRequestHeaders.UserAgent.ParseAdd("MediaBinger/1.0 (mediabingerapps@gmail.com)");
                        var response = client.GetAsync(baseUrl).GetAwaiter().GetResult();

                        if (response.IsSuccessStatusCode)
                        {
                            //var json = await response.Content.ReadAsStringAsync();
                            var jsonString = response.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                            var data = System.Text.Json.JsonSerializer.Deserialize<SetlistsResponse>(jsonString);

                            // 3. Check the 'total' property
                            if (data != null)
                            {
                                int totalSetlists = data.total;
                                HttpContext.Current.Session["playlist11" + "ID" + strArtID] = totalSetlists;

                                // If totalSetlists == 0, you know they don't play live!
                            }
                            else
                            {
                                HttpContext.Current.Session["playlist11" + "ID" + strArtID] = "";
                            }                            
                        }
                        else
                        {
                            HttpContext.Current.Session["playlist11" + "ID" + strArtID] = "";
                        }
                    }
                    catch (Exception ex)
                    {
                        HttpContext.Current.Session["playlist11" + "ID" + strArtID] = "";
                    }

                }
            }
            //Appearances in various artists
            string[] allFiles = Directory.GetFiles(HttpContext.Current.Session["currentDisk"].ToString() + "/Music/V/Various Artists/Audio", "*.*", SearchOption.AllDirectories).Where(file => (file.EndsWith(".mp3") || file.EndsWith(".lnk")) && file.Contains("[") && file.Contains("by " + dtBand?.Rows[0][1]?.ToString())).ToArray();
            if (dtBand?.Rows[0][3].ToString() != "")
            {
                string[] strArtAlias = dtBand.Rows[0][3].ToString().Split(';');
                foreach (string alias in strArtAlias)
                {
                    string[] newFiles = Directory.GetFiles(HttpContext.Current.Session["currentDisk"].ToString() + "/Music/V/Various Artists/Audio", "*.*", SearchOption.AllDirectories).Where(file => (file.EndsWith(".mp3") || file.EndsWith(".lnk")) && file.Contains("[") && file.Contains("by " + alias)).ToArray();
                    if (newFiles.Count() > 0)
                    {
                        allFiles = allFiles.Concat(newFiles).ToArray();
                    }
                }
            }
            Array.Sort(allFiles);
            string strAppearances = string.Join("■", allFiles.Select(filePath => Path.GetFileName(filePath)));
            HttpContext.Current.Session["playlist2" + "ID" + strArtID] = strAppearances;

            //Get Data from Wikipedia
            string strWikiAbout = dtBand.Rows[0][13].ToString() != "" ? dtBand.Rows[0][13].ToString().Replace("█", "\'").Replace("■", ",") : strWikiID != "" ? Wikipedia("about", strWikiID, Convert.ToInt32(dtBand.Rows[0][0]), true) : "";
            //Set description
            if (strWikiAbout != "")
            {
                aboutTextBox.Text = strWikiAbout.Replace("\n", "\n\n");
                bndAbout.Text = strWikiAbout.Replace("\n", "\n\n");
            }

            // Aliases
            if (dtBand.Rows[0][3].ToString() != "")
            {
                trAlias.Attributes.Add("style", "display: block");
                trAlias.Attributes.Add("style", "padding-bottom: 0");
                string[] strAliases = dtBand.Rows[0][3].ToString().Split(';');
                ulAliases.Attributes.Add("style", "display: inline-block");
                string strContent = "<li>";
                int intCountItem = 0;
                string strAlias = "";
                foreach (string alias in strAliases)
                {
                    strAlias = strAlias == "" ? alias : strAlias + "/" + alias;
                    strContent = intCountItem == 0 ? strContent + "<p title='" + alias + "' style='display:inline-block; margin-top:20px; margin-bottom: -20px'>" + alias + "</p>" : strContent + "⠀•⠀<p title='" + alias + "' style='display:inline-block'>" + alias + "</p>";
                    intCountItem++;
                }
                strContent = strContent + "</li>";

                ulAliases.Controls.Add(new LiteralControl(strContent));
                bndAlias.Value = strAlias;

                ulAliases.Attributes.Add("style", "padding-top: 0px");
            }

            //Origin place
            if (dtBand.Rows[0][5].ToString() != "")
            {
                //Get country code
                DataTable dtCountry = ExtServices.GetRecordByValue("countries", " couID", dtBand.Rows[0][5].ToString().Split('[')[0]);
                trOrigin.Attributes.Add("style", "display: block");
                trOrigin.Attributes.Add("style", "padding-bottom: 0");

                string strContent = "<li><span><img src='/Images/Flags/" + dtCountry.Rows[0][3].ToString() + ".svg' width=25px' style='margin-top:-4px;border-radius: 5%;'/>";
                string strCityName = "";

                if (dtBand.Rows[0][4].ToString() != "")
                {
                    string strCity = dtBand.Rows[0][4].ToString().Split('[')[1];
                    strCityName = dtBand.Rows[0][4].ToString().Split('[')[0];
                    strContent = strContent + " <a class='coloredText linkText' target='_blank' href='https://musicbrainz.org/area/" + strCity.Remove(strCity.Length - 1) + "'>" + dtBand.Rows[0][4].ToString().Split('[')[0] + "</a>,";
                }

                string strCountry = dtBand.Rows[0][5].ToString().Split('[')[1];
                strContent = strContent + " <a class='coloredText linkText' target='_blank' href='https://musicbrainz.org/area/" + strCountry.Remove(strCountry.Length - 1) + "'>" + dtCountry.Rows[0][2].ToString() + "</a></span><li>";

                ulOrigin.Controls.Add(new LiteralControl(strContent));
                bndCity.Value = strCityName != "" ? strCityName : "";
                bndCountry.Value = dtCountry.Rows[0][2].ToString() != "" ? dtCountry.Rows[0][2].ToString() : "";

                ulOrigin.Attributes.Add("style", "margin-top: -15px");
            }

            //Genres
            if (dtBand.Rows[0][10].ToString() != "")
            {
                string[] strGenres = dtBand.Rows[0][10].ToString().Split(';');
                trGenres.Attributes.Add("style", "display: block");
                trGenres.Attributes.Add("style", "padding-bottom: 0");
                string strContent = "<li>";
                int intCountItem = 0;
                string strSubGenreNames = "";

                foreach (string genre in strGenres)
                {
                    DataTable dtSubgenre = ExtServices.GetRecordByValue("subgenres", " sgnID", genre);
                    if (dtSubgenre != null && dtSubgenre.Rows.Count > 0)
                    {
                        strSubGenreNames = strSubGenreNames == "" ? dtSubgenre.Rows[0][1].ToString() : strSubGenreNames + "/" + dtSubgenre.Rows[0][1].ToString();
                        strContent = intCountItem == 0 ? strContent + "<p title='" + dtSubgenre.Rows[0][1].ToString() + "' style='display:inline-block;margin-bottom:-10px'>" + dtSubgenre.Rows[0][1].ToString() + "</p>" : strContent + "⠀•⠀<p title='" + dtSubgenre.Rows[0][1].ToString() + "' style='display:inline-block;;margin-bottom:-10px'>" + dtSubgenre.Rows[0][1].ToString() + "</p>";
                        intCountItem++;
                    }
                }

                strContent = strContent + "</li>";

                ulGenres.Controls.Add(new LiteralControl(strContent));
                bndGenres.Value = strSubGenreNames;
                ulGenres.Attributes.Add("style", "padding-top: 3px");
            }

            //Period
            if (dtBand.Rows[0][6].ToString() != "")
            {
                int intCountPeriod = 0;
                bndStartDates.Value = dtBand.Rows[0][6].ToString().Replace(';', '/');
                bndEndDates.Value = dtBand.Rows[0][7].ToString().Replace(';', '/');

                trPeriod.Attributes.Add("style", "display: block");
                trPeriod.Attributes.Add("style", "padding-bottom: 0");
                string[] strStartDates = dtBand.Rows[0][6].ToString().Split(';');
                Session["curStartDate"] = strStartDates.FirstOrDefault().Substring(0, 4);
                string strContent = "<li style ='padding-top: 6px'>";

                //If never splitted
                if (dtBand.Rows[0][7].ToString() == "")
                {
                    strContent = strContent + "<p style='display:inline-block'>" + strStartDates[0].Substring(0, 4) + "–Present</p>";
                    Session["curEndDate"] = DateTime.Now.Year.ToString();
                }

                else
                {
                    string[] strEndDates = dtBand.Rows[0][7].ToString().Split(';');
                    Session["curEndDate"] = strEndDates.LastOrDefault().Substring(0, 4);
                    for (int i = 0; i < strStartDates.Length; i++)
                    {
                        // If ever splitted but active
                        if (strStartDates.Length > strEndDates.Length)
                        {
                            if (i < strEndDates.Length)
                            {
                                strContent = intCountPeriod == 0 ? strContent + "<p style='display:inline-block;;margin-bottom:-10px'>" + strStartDates[i].Substring(0, 4) + "–" + strEndDates[i].Substring(0, 4) + "</p>" : strContent + "⠀•⠀<p style='display:inline-block;margin-bottom:-10px'>" + strStartDates[i].Substring(0, 4) + "–" + strEndDates[i].Substring(0, 4) + "</p>";
                            }
                            else
                            {
                                strContent = intCountPeriod == 0 ? strContent + "<p style='display:inline-block;;margin-bottom:-10px'>" + strStartDates[i].Substring(0, 4) + "–Present</p>" : strContent + "⠀•⠀<p style='display:inline-block;margin-bottom:-10px'>" + strStartDates[i].Substring(0, 4) + "–Present</p>";
                            }
                        }
                        //if splitted
                        else
                        {
                            strContent = intCountPeriod == 0 ? strContent + "<p style='display:inline-block;;margin-bottom:-10px'>" + strStartDates[i].Substring(0, 4) + "–" + strEndDates[i].Substring(0, 4) + "</p>" : strContent + "⠀•⠀<p style='display:inline-block;margin-bottom:-10px'>" + strStartDates[i].Substring(0, 4) + "–" + strEndDates[i].Substring(0, 4) + "</p>";
                        }
                        intCountPeriod++;
                    }
                }

                strContent = strContent + "</li>";
                ulPeriod.Controls.Add(new LiteralControl(strContent));
                ulPeriod.Attributes.Add("style", "margin-top: -5px");
                if (intCountPeriod == 0)
                {
                    ulPeriod.Attributes.Add("style", "margin-bottom: -3px");
                }
            }

            //Similar projects
            string strSimilarArtistID = dtBand.Rows[0][8].ToString();
            //string strSimilarContent = "";
            //int intCountSimilar = 0;

            //string strSimilarContainer = "";
            //string strRelatedContainer = "";


            if (strSimilarArtistID != "")
            {
                //string[] strSimilarArtistArr = strSimilarArtistID.Split(';');
                //foreach (var artistID in strSimilarArtistArr)
                //{
                //    DataTable dtSimilarBand = ExtServices.GetRecordByValue("bands", " bndID", artistID);
                //    if (dtSimilarBand != null && dtSimilarBand.Rows.Count > 0 && artistID != dtBand.Rows[0][0].ToString())
                //    {
                //        //strSimilarContent = strSimilarContent == "" ? strSimilarContent + "<a id='bndSimProject" + intCountSimilar + "' data-id='" + dtSimilarBand.Rows[0][0].ToString() + "' data-code='" + dtSimilarBand.Rows[0][2].ToString() + "' class='simProject coloredText' href='javascript:void(0)' style='font-weight:600; font-size:12px; display:inline-block;'>" + dtSimilarBand.Rows[0][1].ToString() + "</a>" : strSimilarContent + " • <a id='bndSimProject" + intCountSimilar + "' data-id='" + dtSimilarBand.Rows[0][0].ToString() + "' data-code='" + dtSimilarBand.Rows[0][2].ToString() + "' class='simProject coloredText' href='javascript:void(0)' style='font-weight:600; font-size:12px;display:inline-block;'>" + dtSimilarBand.Rows[0][1].ToString() + "</a>";
                //        intCountSimilar++;
                //    }
                //}

                //if (strSimilarContent != "")
                //{
                //    strSimilarContent = strSimilarContent.Replace("█", "\"");

                //    ulSimilar.Controls.Add(new LiteralControl(strSimilarContent));
                //    ulSimilar.Attributes.Add("style", "padding-top: 0px");
                //}
                strSimilarArtistID = strSimilarArtistID.Replace(";", ",");
            }

            //Related projects
            DataTable dtParticipations = ExtServices.GetRecordByValueInnerField("artistparticipations", "arpFKartists", "arpFKbands", "artists", "artStageName", "artID", Session["curArtistID"].ToString().Replace(" ", ""), "arpID");
            string strBands = "";
            string strPartArtists = "";

            string strRelatedArtistID = "";

            Dictionary<string, string> dicArtistPart = new Dictionary<string, string>();

            if (dtParticipations != null && dtParticipations.Rows.Count > 0)
            {
                //Loop for the band members
                for (int i = 0; i < dtParticipations.Rows.Count; i++)
                {
                    DataTable dtArtistParticipations = ExtServices.GetRecordByValueInnerField("artistparticipations", "arpFKartists", "arpFKartists", "artists", "artStageName", "artID", dtParticipations.Rows[i][2].ToString(), "arpID");

                    //Loop for each of the member's participations in other projects
                    for (int j = 0; j < dtArtistParticipations.Rows.Count; j++)
                    {
                        if (!strBands.Contains("[" + dtArtistParticipations.Rows[j][1] + "]") && dtArtistParticipations.Rows[j][1].ToString() != Session["curArtistID"].ToString().Replace(" ", ""))
                        {
                            //strPartArtists = strPartArtists == "" ?  dtParticipations.Rows[i][2].ToString() : strPartArtists + ";" + dtParticipations.Rows[i][2].ToString();
                            dicArtistPart[dtArtistParticipations.Rows[j][1].ToString()] = !dicArtistPart.ContainsKey(dtArtistParticipations.Rows[j][1].ToString()) ? dtArtistParticipations.Rows[j][7].ToString() : dicArtistPart[dtArtistParticipations.Rows[j][1].ToString()] + ", " + dtArtistParticipations.Rows[j][7].ToString();

                            strBands = strBands == "" ? "[" + dtArtistParticipations.Rows[j][1] + "]" : strBands + ";[" + dtArtistParticipations.Rows[j][1] + "]";
                            strRelatedArtistID = strRelatedArtistID == "" ? dtArtistParticipations.Rows[j][1].ToString() :strRelatedArtistID + "," + dtArtistParticipations.Rows[j][1].ToString();
                        }

                        else if (strBands.Contains("[" + dtArtistParticipations.Rows[j][1] + "]") && dtArtistParticipations.Rows[j][1].ToString() != Session["curArtistID"].ToString().Replace(" ", ""))
                        {
                            dicArtistPart[dtArtistParticipations.Rows[j][1].ToString()] = !dicArtistPart.ContainsKey(dtArtistParticipations.Rows[j][1].ToString()) ? dtArtistParticipations.Rows[j][7].ToString() : dicArtistPart[dtArtistParticipations.Rows[j][1].ToString()] + ", " + dtArtistParticipations.Rows[j][7].ToString();
                        }
                    }
                }

                if (strBands != "")
                {
                    //trRelated.Attributes.Add("style", "display: block");
                    //trRelated.Attributes.Add("style", "padding-bottom: 0");
                    string strRelatedContent = "<li>";
                    string[] strRelatedBands = strBands.Replace("[", "").Replace("]", "").Split(';');
                    int intCountProjects = 0;

                    foreach (string project in strRelatedBands)
                    {
                        DataTable dtRelatedBand = ExtServices.GetRecordByValue("bands", " bndID", project);
                        if (dtRelatedBand != null && dtRelatedBand.Rows.Count > 0)
                        {
                            //strRelatedContent = strRelatedContent == "<li>" ? "<a id='bndRelProject" + intCountProjects + "' data-id='" + dtRelatedBand.Rows[0][0].ToString() + "' data-code='" + dtRelatedBand.Rows[0][2].ToString() + "' class='relProject coloredText' href='javascript:void(0)' style='font-weight:600; font-size:12px; display:inline-block'>" + dtRelatedBand.Rows[0][1].ToString() + "</a>" : strRelatedContent + " • <a id='bndRelProject" + intCountProjects + "' data-id='" + dtRelatedBand.Rows[0][0].ToString() + "' data-code='" + dtRelatedBand.Rows[0][2].ToString() + "' class='relProject coloredText' href='javascript:void(0)' style='font-weight:600; font-size:12px;display:inline-block'>" + dtRelatedBand.Rows[0][1].ToString() + "</a>";
                            intCountProjects++;
                        }
                    }

                    strRelatedContent = strRelatedContent.Replace("█", "\"") + " </li>";

                    //ulRelated.Controls.Add(new LiteralControl(strRelatedContent));
                    //ulRelated.Attributes.Add("style", "padding-top: 0px");
                }
            }

            //Other Projects
            string strContentSimilar = "";
            string strContentRelated = "";

            string strNotFound = "";
            string strFilteredSimilarArtistID = "";
            if (strSimilarArtistID != "")
            {
                foreach (string artistID in strSimilarArtistID.Split(','))
                {
                    if (artistID.Contains("_not_found"))
                    {
                        strNotFound = strNotFound == "" ? artistID : strNotFound + ";" + artistID;
                        strFilteredSimilarArtistID = strFilteredSimilarArtistID.Replace("," + artistID, "").Replace(artistID + ",", "").Replace(artistID, "");
                    }
                    else
                    {
                        strFilteredSimilarArtistID = strFilteredSimilarArtistID == "" ? artistID : strFilteredSimilarArtistID + "," + artistID;
                    }
                }
            }

            DataTable dtSimilar = strSimilarArtistID != "" ? ExtServices.GetRecordByValuesSameField("bands", "bndID", strFilteredSimilarArtistID) : new DataTable();
            DataTable dtRelated = strRelatedArtistID != "" ? ExtServices.GetRecordByValuesSameField("bands", "bndID", strRelatedArtistID) : new DataTable();

            strContentSimilar = PrimaryPage.strGridContent(dtSimilar, "V", "OtherProjectsSim", strNotFound);

            //Sort similar
                if (strContentSimilar.Contains("[#SEPARATOR]"))
                {
                strContentSimilar = strContentSimilar.Replace("[#SEPARATOR]", "█");
                    string[] strHTMLArray = strContentSimilar.Split('█');
                    Array.Sort(strHTMLArray);

                    for (int i = 0; i < strHTMLArray.Length; i++)
                    {
                        if (strHTMLArray[i].ToString() != "")
                        {
                            strHTMLArray[i] = strHTMLArray[i].ToString();
                        }
                    }

                strContentSimilar = string.Join("█", strHTMLArray);
                strContentSimilar = strContentSimilar.Replace("█", "");
                }

            strContentRelated = PrimaryPage.strGridContent(dtRelated, "V", "OtherProjectsRel", strPartArtists, dicArtistPart);

            divContentSimilar.InnerHtml = strContentSimilar;
            divContentRelated.InnerHtml = strContentRelated.Replace("[#SEPARATOR]", "");

            if (HttpContext.Current.Session["curArtistID"].ToString() == "120 " || HttpContext.Current.Session["curArtistID"].ToString() == "120")
            {
                divPlayer.Attributes.Add("style", "display: none");
                filterBarSection.Attributes.Add("style", "display: none");
                divTopTracks.Attributes.Add("style", "visibility: hidden");
            }

            //Labels
            DataTable dtLabels = ExtServices.GetRecordByValue("releases", "relFKbands", dtBand.Rows[0][0].ToString());

            if (dtLabels != null && dtLabels.Rows.Count > 0 && HttpContext.Current.Session["curArtistID"].ToString() != "120 " && HttpContext.Current.Session["curArtistID"].ToString() != "120")
            {
                trLabels.Attributes.Add("style", "display: block");
                trLabels.Attributes.Add("style", "padding-bottom: 30");
                //Filter labels
                List<string> lstValsName = new List<string>();

                for (int i = 0; i < dtLabels.Rows.Count; i++)
                {
                    if (!lstValsName.Contains(dtLabels.Rows[i][5].ToString()) && dtLabels.Rows[i][5].ToString() != "Self-released record")
                    {
                        lstValsName.Add(dtLabels.Rows[i][5].ToString());
                    }
                }

                string strContent = "<li><span>";
                int intCountLabels = 0;

                for (int j = 0; j < lstValsName.Count; j++)
                {

                    string strURL = "https://en.wikipedia.org/wiki/" + lstValsName[j] + " Records";

                    try
                    {
                        HttpWebRequest request = WebRequest.Create(strURL) as HttpWebRequest;
                        request.Method = "HEAD";
                        HttpWebResponse response = request.GetResponse() as HttpWebResponse;
                        response.Close();
                    }
                    catch
                    {
                        strURL = "https://en.wikipedia.org/wiki/" + lstValsName[j];

                        try
                        {
                            HttpWebRequest request = WebRequest.Create(strURL) as HttpWebRequest;
                            request.Method = "HEAD";
                            HttpWebResponse response = request.GetResponse() as HttpWebResponse;
                            response.Close();
                        }
                        catch
                        {
                            strURL = "https://www.google.com/search?q=" + lstValsName[j].Replace(" ", "+") + "+label";
                        }
                    }

                    strContent = strContent == "<li><span>" ? strContent + "<a  href='" + strURL + "' target='_blank' id='bndLabel" + intCountLabels + "' data-id='label" + intCountLabels + "' class='artLabel coloredText' href='javascript:void(0)' style='font-weight:600; font-size:12px; display:inline-block'>" + lstValsName[j] + "</a>" : strContent + " • <a href='" + strURL + "' target='_blank' id='bndLabel" + intCountLabels + "' data-id='label" + intCountLabels + "' class='artLabel coloredText' href='javascript:void(0)' style='font-weight:600; font-size:12px; display:inline-block'>" + lstValsName[j] + "</a>";
                    intCountLabels++;
                }

                strContent = strContent + "</span></li>";
                ulLabels.Controls.Add(new LiteralControl(strContent));
                ulLabels.Attributes.Add("style", "margin-top: 5px");
                ulLabels.Attributes.Add("style", "margin-left: -5px");
            }

            //Get artist top tracks
            string strTopTrackPaths = dtBand != null && dtBand.Rows.Count > 0 ? dtBand.Rows[0][14].ToString() : "";
            if (strTopTrackPaths != "")
            {
                string strSource = HttpContext.Current.Session["currentDisk"].ToString();
                string strTopTrackFetch = "";
                string curArtistID = HttpContext.Current.Session["curArtistID"].ToString();
                if (HttpContext.Current.Session["currentTop5Tracks" + curArtistID] == null || HttpContext.Current.Session["currentTop5Tracks" + curArtistID].ToString() == "")
                {
                    strTopTrackFetch = strTopTrackFetching(strTopTrackPaths, strSource);
                    HttpContext.Current.Session["currentTop5Tracks" + curArtistID] = strTopTrackFetch;

                }

                else
                {
                    strTopTrackFetch = HttpContext.Current.Session["currentTop5Tracks" + curArtistID].ToString();
                }
                string strTracksDiv = strTopTrackFetch.Split('^')[0];
                string strTrackPaths = strTopTrackFetch.Split('^')[1];

                divTopTracks.InnerHtml = strTracksDiv;
                divTopTracks.Attributes.Add("style", "display:block");
                divTopTracks.Attributes.Add("style", "margin-top:20px");
                txtTopTrackPaths.Value = strTrackPaths.Replace("'", "%27");
            }

            //Get data from Spotify
            /*DataTable dtAuth = ExtServices.GetRecordByValue("apiauth", "apiName", "Spotify");
            string strKey = "";
            string strSecret = "";

            if (dtAuth != null && dtAuth.Rows.Count > 0 && dtAuth.Rows[0][2].ToString() != "")
            {
                strKey = dtAuth.Rows[0][2].ToString();
                strSecret = dtAuth.Rows[0][3].ToString() != "" ?dtAuth.Rows[0][3].ToString() : "";

                var client = new SpotifyClient(dtAuth.Rows[0][6].ToString());

                if (strSpotifyID != "")
                {
                    Task<string> taskId = Task.Run(() => GetItemData(client, strSpotifyID));
                    taskId.Wait();
                }
                
            }*/
        }

        [WebMethod]
        public static string RefreshSimilarArtists(string strCurColor)
        {
            string strData = "";

            string strArtistID = HttpContext.Current.Session["curArtistID"].ToString() != "" ? HttpContext.Current.Session["curArtistID"].ToString().Replace(" ", "") : "";
            string strBandCode = HttpContext.Current.Session["curArtistCode"].ToString();
            if (strArtistID != "" && strBandCode != "")
            {
                //Get similar artists
                string strStoredExtraData = HttpContext.Current.Session["curExtraData" + strArtistID]?.ToString();
                if (strStoredExtraData == null || strStoredExtraData.ToString() == "")
                {
                    //Delete current top tracks
                    ExtServices.UpdateSingleFieldByID("bands", "", "bndFKartists", "bndID", Convert.ToInt32(strArtistID));
                    strData = GetExtraData(strCurColor, "skip", "true");
                    HttpContext.Current.Session["curExtraData" + strArtistID] = strData;
                }
                else
                {
                    strData = HttpContext.Current.Session["curExtraData" + strArtistID].ToString();
                }
                
            }

            return strData;
        }

        [WebMethod]
        public static string AddSimilarArtists(string strCurColor, string strArtistNames)
        {
            strArtistNames = strArtistNames.Replace("; ", ";");
            string strData = "";
            string strArtistID = HttpContext.Current.Session["curArtistID"].ToString() != "" ? HttpContext.Current.Session["curArtistID"].ToString().Replace(" ", "") : "";
            string strNewBandID = "";
            string strNotFound = "";
            string strSaveData = "";
            string strSimilarArtistID = "";
            //Get ID of artist to add
            foreach (string strArtistName in strArtistNames.Split(';'))
            {
                DataTable dtNewBand = ExtServices.GetRecordByValue("bands", " bndName", strArtistName);
                dtNewBand = dtNewBand == null || dtNewBand.Rows.Count == 0 ? ExtServices.GetRecordLikeValue("bands", "bndOtherNames", strArtistName) : dtNewBand;
                if (dtNewBand != null && dtNewBand.Rows.Count > 0)
                {
                    strNewBandID = strNewBandID == "" ? dtNewBand.Rows[0][0].ToString() : strNewBandID + ";" + dtNewBand.Rows[0][0].ToString();
                }
                else
                {
                    strNotFound = strNotFound == "" ? strArtistName + "_not_found" : strNotFound + ";" + strArtistName + "_not_found";
                }
            }

            if (strArtistID != "" && (strNewBandID != "" || strNotFound != ""))
            {
                //Format data
                DataTable dtBand = ExtServices.GetRecordByValue("bands", " bndCode", HttpContext.Current.Session["curArtistCode"].ToString());
                strSimilarArtistID = dtBand != null && dtBand.Rows.Count > 0 ? dtBand.Rows[0][8].ToString() : "";
                if (strNewBandID != "")
                {
                    strSimilarArtistID = strSimilarArtistID == "" ? strNewBandID : strSimilarArtistID + ";" + strNewBandID;
                }
                
                //Save data
                strSaveData = strNotFound == "" ? strSimilarArtistID : strSimilarArtistID + ";" + strNotFound;
                ExtServices.UpdateSingleFieldByID("bands", strSaveData, "bndFKartists", "bndID", Convert.ToInt32(strArtistID));

                string strFoundBands = "";
                string strNonFoundBands = "";

                //update non found values and existing values to display
                foreach (string strBand in strSaveData.Split(';'))
                {
                    if (!strBand.Contains("_not_found"))
                    {
                        strFoundBands = strFoundBands == "" ? strBand : strFoundBands + "," + strBand;
                    }
                    else
                    {
                        strNonFoundBands = strNonFoundBands == "" ? strBand : strNonFoundBands + ";" + strBand;
                    }
                }

                DataTable dtSimilar = strSimilarArtistID != "" ? ExtServices.GetRecordByValuesSameField("bands", "bndID", strFoundBands) : new DataTable();

                strData = PrimaryPage.strGridContent(dtSimilar, "V", "OtherProjectsSim", strNonFoundBands);

                if (strData.Contains("[#SEPARATOR]"))
                {
                    strData = strData.Replace("[#SEPARATOR]", "█");
                    string[] strHTMLArray = strData.Split('█');
                    Array.Sort(strHTMLArray);

                    for (int i = 0; i < strHTMLArray.Length; i++)
                    {
                        if (strHTMLArray[i].ToString() != "")
                        {
                            strHTMLArray[i] = strHTMLArray[i].ToString();
                        }
                    }

                    strData = string.Join("█", strHTMLArray);
                    strData = strData.Replace("█", "");
                }
            }

            return strData;
        }

        [WebMethod]
        public static string DeleteSimilarArtists(string strCurColor, string strArtistNames)
        {
            strArtistNames = strArtistNames.Replace("; ", ";");
            string strData = "";
            string strArtistID = HttpContext.Current.Session["curArtistID"].ToString() != "" ? HttpContext.Current.Session["curArtistID"].ToString().Replace(" ", "") : "";
            string strNewBandID = "";
            string strNotFound = "";
            //Get ID of artist to delete
            foreach (string strArtistName in strArtistNames.Split(';'))
            {
                DataTable dtNewBand = ExtServices.GetRecordByValue("bands", " bndName", strArtistName);
                dtNewBand = dtNewBand == null || dtNewBand.Rows.Count == 0 ? ExtServices.GetRecordLikeValue("bands", "bndOtherNames", strArtistName) : dtNewBand;
                if (dtNewBand != null && dtNewBand.Rows.Count > 0)
                {
                    strNewBandID = strNewBandID == "" ? dtNewBand.Rows[0][0].ToString() : strNewBandID + ";" + dtNewBand.Rows[0][0].ToString();
                }
                else
                {
                    strNotFound = strNotFound == "" ? strArtistName + "_not_found" : strNotFound + ";" + strArtistName + "_not_found";
                }
            }

            if (strArtistID != "" && (strNewBandID != "" || strNotFound != ""))
            {
                //Format data
                DataTable dtBand = ExtServices.GetRecordByValue("bands", " bndCode", HttpContext.Current.Session["curArtistCode"].ToString());
                string strSimilarArtistID = dtBand != null && dtBand.Rows.Count > 0 ? dtBand.Rows[0][8].ToString() : "";
                string strNewSimilarIDs = "";
                if (strSimilarArtistID != "" && (strNewBandID != "" || strNotFound != ""))
                {
                    string[] myArray = strSimilarArtistID.Split(';');
                    string[] toRemove = strNewBandID.Split(';');
                    string[] toRemove2 = strNotFound.Split(';');
                    var varNewSimilarIDs = myArray.Except(toRemove);
                    varNewSimilarIDs = varNewSimilarIDs.Except(toRemove2);

                    string strFilteredList = "";
                    string strNewNotFound = "";
                    foreach (string similar in varNewSimilarIDs)
                    {
                        strNewSimilarIDs = strNewSimilarIDs == "" ? similar : strNewSimilarIDs + ";" + similar;

                        if (!similar.Contains("_not_found"))
                        {
                            strFilteredList = strFilteredList == "" ? similar : strFilteredList + "," + similar;
                        }
                        else
                        {
                            strNewNotFound = strNewNotFound == "" ? similar : strNewNotFound + ";" + similar;
                        }
                    }

                    //Update database
                    ExtServices.UpdateSingleFieldByID("bands", strNewSimilarIDs, "bndFKartists", "bndID", Convert.ToInt32(strArtistID));

                    DataTable dtSimilar = strSimilarArtistID != "" ? ExtServices.GetRecordByValuesSameField("bands", "bndID", strFilteredList) : new DataTable();
                    strData = PrimaryPage.strGridContent(dtSimilar, "V", "OtherProjectsSim", strNewNotFound);

                    if (strData.Contains("[#SEPARATOR]"))
                    {
                        strData = strData.Replace("[#SEPARATOR]", "█");
                        string[] strHTMLArray = strData.Split('█');
                        Array.Sort(strHTMLArray);

                        for (int i = 0; i < strHTMLArray.Length; i++)
                        {
                            if (strHTMLArray[i].ToString() != "")
                            {
                                strHTMLArray[i] = strHTMLArray[i].ToString();
                            }
                        }

                        strData = string.Join("█", strHTMLArray);
                        strData = strData.Replace("█", "");
                    }
                }
            }

            return strData;
        }
        [WebMethod]
        public static string RefreshTopTracks(string strCurColor)
        {
            string strData = "";

            string strArtistID = HttpContext.Current.Session["curArtistID"].ToString() != "" ? HttpContext.Current.Session["curArtistID"].ToString().Replace(" ","") : "";
            string strBandCode = HttpContext.Current.Session["curArtistCode"].ToString();
            string strSource = HttpContext.Current.Session["currentDisk"].ToString();
            if (strArtistID != "" && strBandCode != "")
            {
                //Delete current top tracks
                ExtServices.UpdateSingleFieldByID("bands", "", "bndtoptracks", "bndID", Convert.ToInt32(strArtistID));

                //Get top tracks
                strData = GetTopTracksCall(strCurColor, strSource);
            }

            return strData;
        }

        public static string strTopTrackFetching (string strTopTrackPaths, string strSource, string strCurColor = "", HttpSessionState varSession = null)
        {

            string strTrackPaths = "";
            int intCountTrack = 0;

            string[] arrTopTracks = strTopTrackPaths.Split('^');
            string strColorStyle = strCurColor != "" ? "color:" + strCurColor : "";
            string strTracksDiv = "<div runat='server' id='divTopTracksContent' style='width:100%;padding-top:10px;margin-bottom:-10px; display: flex;justify-content: center'>";
            foreach (string strTrackPath in arrTopTracks)
            {
                string strReleasePath = "";
                string strTrackName = Path.GetFileNameWithoutExtension(strTrackPath);
                //check if scans folder exists
                string strScansPath = strTrackPath.Replace(Path.GetFileName(strTrackPath), "").Replace("//", "/").Replace("http:/127.0.0.1:8887/", strSource + "/");
                if (Directory.Exists(strScansPath + "[Artwork]"))
                {
                    strReleasePath = strScansPath.Remove(strScansPath.Length - 1, 1);
                    strReleasePath = strReleasePath.Replace(strReleasePath.Split('/').Last(), "");
                    //Check path from singles
                    string strSingleRootPath = "";
                    if (varSession == null)
                    {
                        strSingleRootPath = HttpContext.Current.Session["currentDisk"].ToString() + "/" + HttpContext.Current.Session["curPageName"] + "/" + HttpContext.Current.Session["curArtistInitial"]?.ToString() + "/" + HttpContext.Current.Session["curArtistName"]?.ToString();
                    }
                    else
                    {
                        strSingleRootPath = varSession["currentDisk"].ToString() + "/" + varSession["curPageName"] + "/" + varSession["curArtistInitial"]?.ToString() + "/" + varSession["curArtistName"]?.ToString();
                    }
                    var matchingFolder = Directory.GetDirectories(strSingleRootPath, "*", SearchOption.AllDirectories).FirstOrDefault(dir =>
                    dir.IndexOf("Singles", StringComparison.OrdinalIgnoreCase) >= 0 && dir.IndexOf(strTrackName.Substring(4), StringComparison.OrdinalIgnoreCase) >= 0);

                    //if null check track name with no brackets
                    if (matchingFolder == null)
                    {
                        string strFileNameNoBrackets = Regex.Replace(strTrackName, @" \[.*?\]", string.Empty);
                        matchingFolder = Directory.GetDirectories(strSingleRootPath, "*", SearchOption.AllDirectories).FirstOrDefault(dir =>
                    dir.IndexOf("Singles", StringComparison.OrdinalIgnoreCase) >= 0 && dir.IndexOf(strFileNameNoBrackets.Substring(4), StringComparison.OrdinalIgnoreCase) >= 0);
                    }

                    if (matchingFolder != null)
                    {
                        string[] matchingFiles = Directory.GetFiles(matchingFolder, "*", SearchOption.AllDirectories)
                            .Where(file =>
                                Path.GetFileNameWithoutExtension(file)
                                    .Equals("Cover - front", StringComparison.OrdinalIgnoreCase))
                            .ToArray();
                        if (matchingFiles.Count() > 0)
                        {
                            Array.Sort(matchingFiles);
                            strScansPath = matchingFiles.FirstOrDefault();
                            strScansPath = Path.GetDirectoryName(strScansPath).Replace('\\', '/');
                        }
                        else
                        {
                            //If no single, then original folder
                            strScansPath = strScansPath + "[Artwork]";
                        }

                    }
                    else
                    {
                        //If no single, then original folder
                        strScansPath = strScansPath + "[Artwork]";
                    }
                    
                }

                else
                {
                    continue;
                }

                if (strScansPath != "")
                {
                    string strDirName = new DirectoryInfo(strReleasePath).Name.ToString();
                    if (strDirName == "Albums" || strDirName == "Compilations" || strDirName == "Singles" || strDirName == "Extended Plays" || strDirName == "Live Records")
                    {
                        strDirName = new DirectoryInfo(strScansPath.Replace("/[Artwork]","")).Name.ToString();
                    }
                    string strYear = strDirName.Substring(0, 4);
                    CultureInfo provider = CultureInfo.InvariantCulture;
                    string strDate = strDirName.Substring(0, 11);
                    string strFormattedDate = strDate.Remove(strDate.Length - 1).Replace(".", "-");
                    DateTime dtDate = DateTime.ParseExact(strFormattedDate, new string[] { "yyyy.MM.dd", "yyyy-MM-dd" }, provider, DateTimeStyles.None);
                    strFormattedDate = dtDate.ToString("MMM dd, yyyy");
                    string strFullDirName = strDirName.Replace("'", "\'");
                    strDirName = strDirName.Substring(12).Replace("'", "\'");
                    
                    if (intCountTrack < 5)
                    {
                        string strCoverPath = "";

                        strTrackPaths = strTrackPaths == "" ? strScansPath : strTrackPaths + ";" + strScansPath;
                        if (System.IO.File.Exists(strScansPath + "/Cover - " + strTrackName.Substring(4) + ".jpg"))
                        {
                            strCoverPath = strScansPath + "/Cover - " + strTrackName.Substring(4) + ".jpg";
                        }
                        else if (System.IO.File.Exists(strScansPath + "/Cover - Front.jpg"))
                        {
                            strCoverPath = strScansPath + "/Cover - Front.jpg";
                        }
                        else
                        {
                            strCoverPath = "/Images/System/poster_V.jpg";
                        }

                        strCoverPath = strCoverPath != "" ? strCoverPath.Replace(strSource + "/", "http://127.0.0.1:8887/").Replace("\\", "/").Replace("'", "%27") : "";

                        if (strTrackName.Contains(" ["))
                        {
                            int start = strTrackName.LastIndexOf(" [") + " [".Length;
                            int end = strTrackName.IndexOf("]", start);
                            strTrackName = strTrackName.Remove(start, end - start).Replace(" []", "");
                        }
                        strTrackName = strTrackName.Substring(4);

                        string strEncodedPath = Uri.UnescapeDataString(strTrackPath);

                        int intWidthItem = arrTopTracks.Length > 5 ? 5 : arrTopTracks.Length;
                        strTracksDiv = strTracksDiv + "<div id='topTrackContainer" + intCountTrack + "' class='divTopTrack' style='display: inline-block;width:" + 100 / intWidthItem + "%; cursor:pointer' data-value='" + strDirName.Replace("'", "%27") + "' >"
                            + "<img runat='server' id='imgTopTrack" + intCountTrack + "' class='imgTopTrack' src='" + strCoverPath + "' data-value='" + strFullDirName.Replace("'", "%27") + "' style='display: table; margin: 0 auto; margin-top: 5px; height: 70px; max-width:100%; cursor:pointer' title='Go to " + strDirName.Replace("'", "%27") + "'/>"
                            + "<span id = 'SingleSpan" + intCountTrack + "' class = 'divSubContentSpan' data-name='" + strDirName.Replace(";", ",") + "' style='text-align: center;font-size:10px;margin: 0 auto;display: table;margin-top:2px'>"
                            + "<p class='aTopTrack coloredText' title='Play track' data-value='" + strDirName.Replace("'", "%27") + "' data-path='"+ strEncodedPath + "' style='text-decoration: none; font-weight:bold;cursor:pointer; "+ strColorStyle + "'>" + strTrackName.Replace("'", "%27") + "</p><p style='margin-top:-20px'>" + strFormattedDate + "</p></span></div>";

                        intCountTrack++;
                    }
                    else
                    {
                        break;
                    }

                }
            }

            strTracksDiv = strTracksDiv + "</div>";

            return strTracksDiv + "^" + Uri.UnescapeDataString(strTrackPaths);
        }

        [WebMethod]
        public static string GetProminentColor(string strPath = "\\Images\\System\\poster_H.jpg")
        {
            if (strPath == "" || strPath.EndsWith("/"))
            {
                //return "#000000";
                return "#7a7e82";
            }
            else
            {
                if (strPath.Contains(HttpContext.Current.Session["currentServer"].ToString()))
                {
                    strPath = HttpContext.Current.Session["currentServer"].ToString() + strPath.Replace(HttpContext.Current.Session["currentServer"].ToString(), "^").Split('^').LastOrDefault().Replace("\\","/");
                }

                strPath = strPath.Replace(HttpContext.Current.Session["currentServer"].ToString(), HttpContext.Current.Session["currentDisk"].ToString()).Replace("%27", "'");
                Bitmap bmImage = new Bitmap(strPath);
                bmImage = new Bitmap(bmImage, new Size(bmImage.Width / 10, bmImage.Height / 10));
                var colorThief = new ColorThief();
                var color = colorThief.GetColor(bmImage);
                return color.Color.ToString();
            }
        }

        public static async Task<string> GetItemData(SpotifyClient client, string name)
        {
            var track = await client.Artists.GetRelatedArtists(name);
            return "";
        }

        public static string Wikipedia(string strType, string strPageName, int intID, bool update = false)
        {
            WebClient client = new WebClient();
            string strPage = "";
            using (Stream stream = client.OpenRead("http://en.wikipedia.org/w/api.php?format=json&action=query&prop=extracts&explaintext=1&titles=" + strPageName))
            using (StreamReader reader = new StreamReader(stream))
            {
                JsonSerializer ser = new JsonSerializer();
                ExtServices.Result result = ser.Deserialize<ExtServices.Result>(new JsonTextReader(reader));

                foreach (ExtServices.Page page in result.query.pages.Values)
                {
                    strPage = strPage + page.extract;
                }
            }

            //Format retrieved data
            switch (strType)
            {
                case "about":
                    int index = strPage.IndexOf("\n\n\n=");
                    if (index > 0)
                    {
                        strPage = strPage.Substring(0, index);
                    }
                    break;
                default:
                    break;
            }
            //Store in db
            if (update == true)
            {
                ExtServices.UpdateSingleFieldByID("bands", strPage.Replace("\"", "").Replace("'", ""), "bndFKimages", "bndID", intID);
            }
            return strPage;
        }

        [WebMethod]
        public static string UpdateArtistData(string strData = "", string strURLOld = "", string strURLNew = "")
        {
            string strResult = "";
            Dictionary<string, string> dicData = strData.Split(new[] { '^' }, StringSplitOptions.RemoveEmptyEntries)
               .Select(part => part.Split('>'))
               .ToDictionary(split => split[0], split => split[1]);

            //Update main data
            //Get band data by id
            DataTable dtBand = ExtServices.GetRecordByValue("bands", "bndID", HttpContext.Current.Session["curArtistID"].ToString());

            if (dtBand != null && dtBand.Rows.Count > 0)
            {
                for (int i = 1; i < 14; i++)
                {
                    if (i < 8 || i == 10 || i == 13)
                    {
                        string strNewValue = dicData["" + i + ""].Split('@')[1].Replace(',', '■').Replace('\'', '█').Replace('/', ';');
                        string strValueOriginal = dtBand.Rows[0][i].ToString();
                        string strGenres = "";

                        // City and country
                        if (i == 4 || i == 5)
                        {
                            int start = strValueOriginal.LastIndexOf("[") + "[".Length;
                            int end = strValueOriginal.IndexOf("]", start);
                            string result = strValueOriginal.Remove(start, end - start).Replace("[]", "");

                            //Fetch country by ID
                            if (i == 5 && result != "")
                            {
                                DataTable dtCountry = ExtServices.GetRecordByValue("countries", "couID", result);
                                if (dtCountry != null && dtCountry.Rows.Count > 0)
                                {
                                    result = dtCountry.Rows[0][2].ToString();
                                }
                            }

                            strValueOriginal = result;
                        }

                        //Genres
                        else if (i == 10)
                        {
                            string result = "";

                            string[] strSubgenres = strNewValue.Split(';');
                            foreach (var subgenre in strSubgenres)
                            {
                                DataTable dtSubgenres = ExtServices.GetRecordByValue("subgenres", "sgnName", subgenre);
                                if (dtSubgenres != null && dtSubgenres.Rows.Count > 0)
                                {
                                    result = result == "" ? dtSubgenres.Rows[0][0].ToString() : result + ";" + dtSubgenres.Rows[0][0].ToString();
                                    //Prevent duplicates
                                    if (!strGenres.Contains(dtSubgenres.Rows[0][2].ToString()))
                                    {
                                        strGenres = strGenres == "" ? dtSubgenres.Rows[0][2].ToString() : strGenres + ";" + dtSubgenres.Rows[0][2].ToString();
                                    }
                                }
                            }

                            strNewValue = result;
                        }

                        if (strNewValue != strValueOriginal)
                        {
                            //Retrieve code for country and city

                            if (!strNewValue.Contains("[") && (i == 4 || i == 5))
                            {
                                //Fetch country by ID
                                if (i == 5)
                                {
                                    DataTable dtCountry = ExtServices.GetRecordByValue("countries", "couName", strNewValue);
                                    if (dtCountry != null && dtCountry.Rows.Count > 0)
                                    {
                                        strNewValue = dtCountry.Rows[0][0].ToString();
                                    }
                                }

                                DataTable dtPlaceCode = i == 4 ? ExtServices.GetRecordLikeValue("bands", "bndOriginPlace", strNewValue) : ExtServices.GetRecordLikeValue("bands", "bndFKcountries", strNewValue);

                                if (dtPlaceCode != null && dtPlaceCode.Rows.Count > 0)
                                {
                                    strNewValue = i == 4 ? dtPlaceCode.Rows[0][4].ToString() : dtPlaceCode.Rows[0][5].ToString();
                                }
                            }

                            //About
                            else if (i == 13)
                            {
                                //if (!strURLOld.Contains("wikipedia") && !strURLNew.Contains("wikipedia"))
                                //{
                                ExtServices.UpdateSingleFieldByID("bands", strNewValue.Replace("\n", "\n\n"), dicData["" + i + ""].Split('@')[0], "bndID", Convert.ToInt32(dtBand.Rows[0][0].ToString()));
                                //}
                            }
                            // Main fields
                            else
                            {
                                //Rename directory if Name is changed
                                if (i == 1)
                                {
                                    char charInitialChar2 = strValueOriginal.ToUpper()[0];
                                    charInitialChar2 = Char.IsDigit(charInitialChar2) ? '#' : Char.IsSymbol(charInitialChar2) ? '' : charInitialChar2;

                                    char charInitialChar3 = strNewValue.ToUpper()[0];
                                    charInitialChar3 = Char.IsDigit(charInitialChar3) ? '#' : Char.IsSymbol(charInitialChar3) ? '' : charInitialChar3;
                                    if (Directory.Exists(HttpContext.Current.Session["currentDisk"].ToString() + "/" + HttpContext.Current.Session["curPageName"] + "/" + charInitialChar2 + "/" + strValueOriginal) && !Directory.Exists(HttpContext.Current.Session["currentDisk"].ToString() + "/" + HttpContext.Current.Session["curPageName"] + "/" + charInitialChar3 + "/" + strNewValue))
                                    {
                                        strResult = strValueOriginal + "^" + strNewValue;
                                        HttpContext.Current.Session["curArtistName"] = strNewValue;
                                        char charInitialChar = HttpContext.Current.Session["curArtistName"].ToString().ToUpper()[0];
                                        HttpContext.Current.Session["curArtistInitial"] = Char.IsDigit(charInitialChar) ? '#' : Char.IsSymbol(charInitialChar) ? '' : charInitialChar;
                                    }
                                }

                                ExtServices.UpdateSingleFieldByID("bands", strNewValue, dicData["" + i + ""].Split('@')[0], "bndID", Convert.ToInt32(dtBand.Rows[0][0].ToString()));
                            }

                            //If main genres are different
                            if (strGenres != "" && strGenres != dtBand.Rows[0][9].ToString())
                            {
                                ExtServices.UpdateSingleFieldByID("bands", strGenres, "bndFKgenres", "bndID", Convert.ToInt32(dtBand.Rows[0][0].ToString()));
                            }
                        }
                    }
                }
            }

            //Update old URL
            string strUpdatedURLField = "";
            if (strURLOld != "")
            {
                strURLOld = strURLOld.Replace("^", ";").Replace(": h", "■h");
                string strCurrentOldURL = dtBand.Rows[0][12].ToString();
                if (strURLOld != strCurrentOldURL)
                {
                    ExtServices.UpdateSingleFieldByID("bands", strURLOld, "bndWebsites", "bndID", Convert.ToInt32(dtBand.Rows[0][0].ToString()));
                    strUpdatedURLField = strURLOld;
                }
            }

            //Insert New URL

            if (strURLNew != "")
            {
                strURLNew = strURLNew.Replace("^", ";").Replace(": h", "■h").Replace("'", "%27");

                //Store video links in videosource table, example: YYYY.MM.DD. Video Title (Music Video) [Producer]: https://www.videolink.com/
                if (strURLNew.Contains("Video)"))
                {
                    string[] strURLs = strURLNew.Split(';');
                    List<string> lstArtistColsNew = new List<string>();
                    List<string> lstArtistValsNew = new List<string>();

                    lstArtistColsNew.Add("visParentID");
                    lstArtistColsNew.Add("visReleaseDate");
                    lstArtistColsNew.Add("visTitle");
                    lstArtistColsNew.Add("visLink");
                    lstArtistColsNew.Add("visType");
                    lstArtistColsNew.Add("visExtra");


                    foreach (string url in strURLs)
                    {
                        lstArtistValsNew.Clear();
                        string strUrl = url.Substring(1, url.Length - 2);
                        string strDate = strUrl.Substring(0, 11);
                        string strLink = strUrl.Substring(strUrl.LastIndexOf('■') + 1);

                        int pFrom = strUrl.IndexOf("(") + "(".Length;
                        int pTo = strUrl.LastIndexOf(")");

                        string strType = strUrl.Substring(pFrom, pTo - pFrom);

                        pFrom = strUrl.IndexOf("[") + "[".Length;
                        pTo = strUrl.LastIndexOf("]");

                        string strExtra = strUrl.Substring(pFrom, pTo - pFrom);

                        string strName = strUrl.Replace(strDate, "").Replace(strType, "").Replace(strExtra, "").Replace(strLink, "").Replace("()", "").Replace("[]", "").Replace("■", "").Substring(1);
                        strName = strName.Remove(strName.Length - 2);

                        lstArtistValsNew.Add(HttpContext.Current.Session["curArtistID"].ToString().Replace(" ",""));
                        lstArtistValsNew.Add(strDate);
                        lstArtistValsNew.Add(strName);
                        lstArtistValsNew.Add(strLink);
                        lstArtistValsNew.Add(strType);
                        lstArtistValsNew.Add(strExtra);

                        ExtServices.InsertByTableName("videosource", lstArtistColsNew, lstArtistValsNew);
                    }
                }

                else
                {
                    string strCurrentOldURL = strUpdatedURLField == "" ? dtBand.Rows[0][12].ToString() : strUpdatedURLField;
                    strURLNew = strCurrentOldURL + ";" + strURLNew;
                    ExtServices.UpdateSingleFieldByID("bands", strURLNew, "bndWebsites", "bndID", Convert.ToInt32(dtBand.Rows[0][0].ToString()));
                }
            }

            return strResult;
        }

        [WebMethod]
        public static string GetExtraData(string strCurColor, string strGetSimilar, string strRefresh)
        {
            string strArtistID = HttpContext.Current.Session["curArtistID"]?.ToString().Replace(" ", "");
            if (HttpContext.Current.Session["currArtExtData" + strArtistID] == null || HttpContext.Current.Session["currArtExtData" + strArtistID].ToString() == "")
            {
                DataTable dtBand = ExtServices.GetRecordByValue("bands", " bndCode", HttpContext.Current.Session["curArtistCode"].ToString());
                string strCurPage = HttpContext.Current.Session["curPageName"].ToString();
                string strSource = HttpContext.Current.Session["currentDisk"].ToString();
                //Get Similar from Last.fm

                DataTable dtKeys = ExtServices.GetRecordByValue("apiauth", " apiName", "Last.fm");
                var client = new LastfmClient(dtKeys.Rows[0][2].ToString(), dtKeys.Rows[0][3].ToString());
                HttpSessionState varSession = HttpContext.Current.Session;

                Task<string> taskId = strGetSimilar == "true" ? Task.Run(() => GetArtistSimilarAndTopTracks(client, dtBand, strSource, strCurColor, "", strRefresh, strCurPage, varSession)) : strGetSimilar == "skip" ? Task.Run(() => GetArtistSimilarAndTopTracks(client, dtBand, strSource, strCurColor, "skip", strRefresh, strCurPage)) : Task.Run(() => GetTopTracks(client, dtBand, strSource, strCurColor, "", varSession));
                taskId.Wait();

                string strResult = taskId.Result;
                if (strResult.Count(f => f == '^') == 1)
                {
                    strResult = "^" + strResult;
                }

                if (strResult.Contains("_top100tracks_"))
                {
                    string[] strTopTrackArr = strResult.Split(new string[] { "_top100tracks_" }, StringSplitOptions.None);
                    //Top 100 tracks playlist
                    HttpContext.Current.Session["playlist13" + "ID" + strArtistID] = strTopTrackArr[1];
                    strResult = strResult.Replace("_top100tracks_" + strTopTrackArr[1], "");
                }
                HttpContext.Current.Session["currArtExtData" + strArtistID] = strResult;
                return strResult;
            }
            else
            {
                return HttpContext.Current.Session["currArtExtData" + strArtistID].ToString();
            }

            
        }

        [WebMethod]
        public static string GetTopTracksCall(string strCurColor, string strSource)
        {
            DataTable dtBand = ExtServices.GetRecordByValue("bands", " bndCode", HttpContext.Current.Session["curArtistCode"].ToString());
            //Get Similar from Last.fm

            DataTable dtKeys = ExtServices.GetRecordByValue("apiauth", " apiName", "Last.fm");
            var client = new LastfmClient(dtKeys.Rows[0][2].ToString(), dtKeys.Rows[0][3].ToString());

            Task<string> taskId = Task.Run(() => GetTopTracks(client, dtBand, strSource, strCurColor));
            taskId.Wait();

            string strResult = taskId.Result;
            
            return strResult;
        }

        [WebMethod]
        public static string FillContentPage(string strFolder = "", string strLinkedReleaseTitle = "", string strLinkedReleasePath = "", string strTourData = "", string strShowDate = "")
        {
            string strArtistID = HttpContext.Current.Session["curArtistID"]?.ToString().Replace(" ", "");
            //Check for release artwork path
            string strReleaseArtworkPath = HttpContext.Current.Session["[Release]"]?.ToString();
            bool isArtwork = false;
            string strCurrentEdition = "";
            if (strFolder.Contains("[Release]") && strReleaseArtworkPath != null && strReleaseArtworkPath != "")
            {
                strCurrentEdition = strFolder.Replace("[Release]", "");
                strFolder = strReleaseArtworkPath.Contains("[Artwork]") ? strReleaseArtworkPath : strReleaseArtworkPath + "/[Artwork]";
                isArtwork = true;
            }
            string strCurrentFolder = strFolder.Replace("\\", "/").Split('/').Last();
            string strReturnData = HttpContext.Current.Session["curContent" + strCurrentFolder + HttpContext.Current.Session["curArtistName"].ToString().Replace(" ","")]?.ToString();
            if (strReturnData != null && strReturnData != "" && isArtwork == false)
            {
                return strReturnData;
            }
            string strInnerHTML = "";
            string strGalleryBar = "";
            strFolder = strFolder.Contains("/library") ? strFolder.Replace("\\","/").Replace(strFolder.Replace("\\", "/").Split('/').Last(), "") : strFolder;
            char charInitialChar = HttpContext.Current.Session["curArtistName"].ToString().ToUpper()[0];
            charInitialChar = Char.IsDigit(charInitialChar) ? '#' : Char.IsSymbol(charInitialChar) ? '' : charInitialChar;
            strFolder = isArtwork == true ? strFolder : HttpContext.Current.Session["currentDisk"].ToString().Replace(":", "") + strFolder;
            string strSection = strFolder;

            if (strFolder.ToLower().Contains("[playlists]"))
            {
                //Get playlist names
                string[] strPlaylistLogos = Directory.GetFiles(HttpContext.Current.Server.MapPath("~/Images/Logos/"));
                string[] strPlaylistCovers = Directory.GetFiles(HttpContext.Current.Server.MapPath("~/Images/Playlists/"));
                Array.Sort(strPlaylistLogos);
                Array.Sort(strPlaylistCovers);
                DataTable dtPlaylistArtist = ExtServices.GetRecordByValue("playlists", "plaType", "201");

                if (dtPlaylistArtist != null && dtPlaylistArtist.Rows.Count > 0)
                {
                    for (int i = 0; i < dtPlaylistArtist.Rows.Count; i++)
                    {
                        if (HttpContext.Current.Session["playlist" + i + "ID" + strArtistID] != null && HttpContext.Current.Session["playlist" + i + "ID" + strArtistID].ToString() != "")
                        {
                            string[] strPlaylistCoverArr = strPlaylistCovers.Where(c => c.Contains(dtPlaylistArtist.Rows[i][1].ToString())).ToArray();
                            string strPlaylistCover = strPlaylistCoverArr != null && strPlaylistCoverArr.Length > 0 ? strPlaylistCoverArr[0] : "/Images/System/" + "poster_S.jpg";
                            if (strPlaylistCover.Contains("Aoide"))
                            {
                                string[] strCoverPath = strPlaylistCover.Split(new string[] { "Aoide" }, StringSplitOptions.None);
                                strPlaylistCover = strCoverPath[1].Replace("\\","/");
                            }
                            string[] strPlaylistLogoArr = strPlaylistLogos.Where(c => c.Contains(dtPlaylistArtist.Rows[i][1].ToString())).ToArray();
                            string strPlaylistLogo = strPlaylistLogoArr != null && strPlaylistLogoArr.Length > 0 ? strPlaylistLogoArr[0] : "/Images/System/" + "logo-main.png";
                            if (strPlaylistLogo.Contains("Aoide"))
                            {
                                string[] strCoverPath = strPlaylistLogo.Split(new string[] { "Aoide" }, StringSplitOptions.None);
                                strPlaylistLogo = strCoverPath[1].Replace("\\", "/");
                            }
                            string strNameSpan = "<span id = 'LogoSpan" + i + "' class = 'logo_span logo_span_S divContentSpan' data-name='" + dtPlaylistArtist.Rows[i][1].ToString() + "'><img id = 'itemLogo" + i + "' class='logo_item_S'  src='" + strPlaylistLogo + "' style='width: 80%; height:80%'></img></span>";

                            strInnerHTML += "<div class='itemBox item_container item_container_S item_container_playlist' style='margin-bottom:-6px' data-id='" + dtPlaylistArtist.Rows[i][1].ToString() + "' data-url='" + "http://127.0.0.1:8887/" + HttpContext.Current.Session["curPageName"] + "/" + charInitialChar + "/" + HttpContext.Current.Session["curArtistName"].ToString().Replace(" ", "%20").Replace("'", "%27") + "' data-section='" + strFolder + "' data-fullname='01.01.1000. " + dtPlaylistArtist.Rows[i][1].ToString() + "'>" +
                                        "<div id= 'item2Div" + i + "' class= 'button_item_S divContentItem" + i + "'" +
                                        "style='background-image:url(\"" + strPlaylistCover + "\"); background-size:cover; background-position:center;'>" +
                                        "</div><div class='button_content_S' title = '" + dtPlaylistArtist.Rows[i][1].ToString() + "' style ='margin-top:-50px'>" + strNameSpan + "</div></div>";
                        }
                    }
                }
                return strInnerHTML;
            }

            //All content
            bool isPromoMaterial = (HttpContext.Current.Session["curReleaseRootPath"] != null && HttpContext.Current.Session["curReleaseRootPath"].ToString().Contains("Promo Material")) || strFolder == "Promo Release" ? true : false;
            strFolder = strFolder.Contains("/video") ? strFolder.Replace("\\", "/").Replace("/" + strFolder.Replace("\\", "/").Split('/').Last(),"") : strFolder.Replace("\\", "/");
            string[] strDirectories = isArtwork == true || isPromoMaterial ? new string[] { "[Artwork]" } :  Directory.GetDirectories(strFolder);
            string strExtension = strFolder.Contains("library") ? "*.pdf" : strCurrentFolder == "Photos" ? "*.*" : strCurrentFolder == "Logos" ? "*.png" : "*.lnk";
            if (isPromoMaterial)
            {
                strFolder = HttpContext.Current.Session["currentDisk"].ToString() + "/" + HttpContext.Current.Session["curPageName"] + "/" + HttpContext.Current.Session["curArtistInitial"]?.ToString() + "/" + HttpContext.Current.Session["curArtistName"] + "/Video";
            }
            string[] lnkFiles = strFolder.Contains("[Artwork]") ? strDirectories : strFolder.Contains("gallery") ? Directory.GetFiles(strFolder, strExtension)
                .Where(file => !file.EndsWith(".ini") && !file.EndsWith(".pdf")).ToArray() : Directory.GetFiles(strFolder, strExtension).Where(file => !file.EndsWith(".ini")).ToArray(); //Get links
            if (isPromoMaterial)
            {
                lnkFiles = Directory.GetFiles(strFolder, "*Promo Material.jpg", SearchOption.AllDirectories);
            }
            else
            {
                lnkFiles = strFolder.Contains("[Artwork]") ? Directory.GetFiles(strFolder.Replace(HttpContext.Current.Session["currentServer"].ToString(), HttpContext.Current.Session["currentDisk"].ToString()))
                .Where(file => !file.EndsWith(".ini") && !file.EndsWith(".pdf") && !file.EndsWith(".gif") && !file.EndsWith(".mp4") && !file.ToLower().Contains("spotify") && !file.ToLower().Contains("logo") && !file.ToLower().Contains("photocard") && !file.ToLower().Contains("wallpaper") && !file.ToLower().Contains("qr")).ToArray() : lnkFiles; //Get release artwork
                lnkFiles = lnkFiles.Length == 0 && strFolder.Contains("video") ? Directory.GetFiles(strFolder, "*Promo Material.*", SearchOption.AllDirectories) : lnkFiles;
            }

            //Get files for Other tab in Release gallery
            string[] lnkOtherFiles = strFolder.Contains("[Artwork]") ? Directory.GetFiles(strFolder.Replace(HttpContext.Current.Session["currentServer"].ToString(), HttpContext.Current.Session["currentDisk"].ToString()))
                .Where(file => !file.EndsWith(".ini") && !file.EndsWith(".pdf") && !file.EndsWith(".gif") && !file.EndsWith(".mp4") && (file.ToLower().Contains("spotify") || file.ToLower().Contains("logo") || file.ToLower().Contains("photocard") || file.ToLower().Contains("wallpaper") || file.ToLower().Contains("qr"))).ToArray() : new string[] { "[NO_DATA]" }; //Get release other files

            string strTourPath = HttpContext.Current.Session["currentDisk"].ToString() + "/" + HttpContext.Current.Session["curPageName"] + "/" + charInitialChar + "/" + HttpContext.Current.Session["curArtistName"] + "/Gallery/Tours";
            if (strTourData != null && strTourData != "" && Directory.Exists(strTourPath))
            {
                string targetFolder = Directory.GetDirectories(strTourPath).FirstOrDefault(dir => dir.Contains(strTourData));

                if (targetFolder != null)
                {
                    string[] files = Directory.GetFiles(targetFolder).Where(file =>
                        (file.Contains("Tour - ") ||
                        file.Contains(strShowDate)) &&
                        !file.EndsWith(".ini", StringComparison.OrdinalIgnoreCase) &&
                        !file.EndsWith(".ico", StringComparison.OrdinalIgnoreCase))
                        .ToArray();
                    if (files.Count() > 0)
                    {
                        lnkOtherFiles = lnkOtherFiles.Concat(files).ToArray();
                    }
                }
            }

            if (lnkFiles.Length > 0)
            {
                Array.Sort(lnkFiles);
                List<string> lstNewPaths = new List<string>();
                foreach (string file in lnkFiles)
                {
                    if (isPromoMaterial)
                    {
                        lstNewPaths.Add(file);
                    }
                    else if (strFolder.Contains("library") || strFolder.Contains("video"))
                    {
                        lstNewPaths.Add(file);
                    }
                    else if (strFolder.Contains("gallery") && !file.Contains("_small."))
                    {
                        lstNewPaths.Add(file);
                    }
                    else if (strFolder.Contains("[Artwork]") && !file.Contains("_small."))
                    {
                        lstNewPaths.Add(file);
                    }
                    else if (Path.GetFileName(file).Contains("[By "))
                    {
                        string originalArtist = Path.GetFileNameWithoutExtension(file).Split(new[] { "[By ", "]" }, StringSplitOptions.None).Where((item, index) => index % 2 == 1).FirstOrDefault();
                        char charNewInitial = Char.IsDigit(originalArtist.ToUpper()[0]) ? '#' : Char.IsSymbol(originalArtist.ToUpper()[0]) ? '' : originalArtist.ToUpper()[0];
                        string strNewPath = strFolder.Replace(charInitialChar + "/" + HttpContext.Current.Session["curArtistName"].ToString(), charNewInitial + "/" + originalArtist).Replace("/" + strFolder.Split('/').Last(), "");
                        strNewPath = Directory.GetDirectories(strNewPath, "*", SearchOption.AllDirectories).Where(dir => new DirectoryInfo(dir).Name.Contains(Path.GetFileNameWithoutExtension(file).Replace(" [","[").Split('[').FirstOrDefault())).FirstOrDefault();
                        lstNewPaths.Add(strNewPath);
                    }
                }
                if (lstNewPaths.Count > 0)
                {
                    strDirectories = isPromoMaterial ? lstNewPaths .ToArray() : strDirectories.Concat(lstNewPaths.ToArray()).ToArray();
                }
            }

            Array.Sort(strDirectories);
            string strImageURL = "/Images/System/" + "poster_S.jpg";
            int intCountItems = 0;
            CultureInfo provider = CultureInfo.InvariantCulture;
            List<string> lstExistingPaths = new List<string>();
            if (strFolder.ToLower().Contains("/singles") && isArtwork == false)
            {
                strDirectories = Directory.GetDirectories(strFolder, "*", SearchOption.AllDirectories).Where(dir => dir.Count(c => c == Path.DirectorySeparatorChar) == strFolder.Count(c => c == Path.DirectorySeparatorChar) + 2).ToArray();
                // Normalize slashes
                strDirectories = strDirectories.Select(p => p.Replace('\\', '/')).ToArray();

                // Find parent folders of paths ending with "Standard Edition"
                var flaggedParents = strDirectories
                    .Where(p => p.EndsWith("Standard Edition", StringComparison.OrdinalIgnoreCase))
                    .Select(p => Path.GetDirectoryName(p).Replace('\\', '/')) // parent of "Standard Edition"
                    .Distinct()
                    .ToList();

                // Remove all paths that start with any of the flagged parents
                var cleaned = strDirectories
                    .Where(p => !flaggedParents.Any(parent => p.StartsWith(parent + "/", StringComparison.OrdinalIgnoreCase)))
                    .ToList();

                // Add the parent folders back
                cleaned.AddRange(flaggedParents);

                // Optional: sort the result
                cleaned = cleaned.OrderBy(p => p).ToList();
                strDirectories = cleaned.Select(p => p.Replace("[Artwork]", "").TrimEnd('/', '\\')).ToArray();
                Array.Sort(strDirectories);
            }

            string strReleaseGalleryClass = strFolder.Contains("[Artwork]") ? "classReleaseGallery classRelease-artwork" : "";
            foreach (string directory in strDirectories)
            {
                string strCurrentDirectory = directory.Replace("\\", "/").Split('/').Last().ToString().ToLower().Contains("[artwork]") || directory.Replace("\\", "/").Split('/').Last().ToString().ToLower().Contains(" edition") ? directory.Replace("\\", "/").Replace("/" + directory.Replace("\\", "/").Split('/').Last(), "") : directory.Replace("\\", "/");
                if (lstExistingPaths.Contains(strCurrentDirectory))
                    continue; // Skip duplicates
                if (directory.Contains("/library") && directory.Contains("/[Artwork]"))
                    continue; // Skip duplicates
                if (directory == "[Artwork]")
                    continue; // Skip empty
                lstExistingPaths.Add(strCurrentDirectory);
                string strDate = Path.GetFileName(strCurrentDirectory).Length > 11 && !directory.Contains("/gallery") && !directory.Contains("/[Artwork]") ? Path.GetFileName(strCurrentDirectory).Substring(0, 11) : ("1900.01.01. " + Path.GetFileName(strCurrentDirectory)).Substring(0, 11);
                string strFormattedDate = DateTime.ParseExact(strDate.Remove(strDate.Length - 1).Replace(".", "-"), new string[] { "yyyy.MM.dd", "yyyy-MM-dd" }, provider, DateTimeStyles.None).ToString("MMMM dd, yyyy");
                string strName = Path.GetFileName(strCurrentDirectory).Replace(strDate + " ", "").Replace("'", "\'").Replace(".pdf", "").Replace(".png", "").Replace(".jpg", "");
                string strExternalArtist = "", strOriginalArtist = "";
                if (strCurrentDirectory.Split('/')[3].ToString() != HttpContext.Current.Session["curArtistName"].ToString())
                {
                    string strSessionVarKey = "rel" + strName.Replace(" ", ""); // external artist into session variable
                    HttpContext.Current.Session[strSessionVarKey] = strCurrentDirectory.Split('/')[3].ToString();
                    strOriginalArtist = " [By " + strCurrentDirectory.Split('/')[3].ToString() + "]";
                    strExternalArtist = "<span class = 'icon_span icon_span_S3 divContentSpan divContentExternalArtist' data-name='"+ strCurrentDirectory.Split('/')[3].ToString() + "'>By "+ strCurrentDirectory.Split('/')[3].ToString() + "</span>";
                }
                string strItemPath = strCurrentDirectory.Replace("\\", "/").Replace(HttpContext.Current.Session["currentDisk"].ToString(), "");
                string strLogoPath = strCurrentDirectory.Contains(".pdf") || strCurrentDirectory.Contains(".jpg") || directory.Contains("/[Artwork]") || directory.Contains("/gallery") ? "" : Directory.GetFiles(strCurrentDirectory, "Logo.png", SearchOption.AllDirectories)?.FirstOrDefault()?.Replace("\\", "/").Replace(HttpContext.Current.Session["currentDisk"].ToString(), HttpContext.Current.Session["currentServer"].ToString());
                string strCoverPath = strCurrentDirectory.Replace(HttpContext.Current.Session["currentDisk"].ToString(), "");
                string strBackgroundProps = (strCurrentDirectory.ToLower().Contains("/gallery") && strCurrentDirectory.ToLower().Contains(".png")) || strCurrentDirectory.ToLower().Contains("[artwork]") ? "background-size:contain; background-repeat: no-repeat; background-position:center" : "background-size:cover; background-position:center";
                if (isArtwork == false && !directory.Contains("/gallery") && !strCurrentDirectory.Contains(".jpg"))
                {
                    string[] strCoverPaths = strCurrentDirectory.Contains(".pdf") ? Directory.GetFiles(strCurrentDirectory.Replace(strCurrentDirectory.Split('/').Last(), "") + "[Artwork]", strDate + " " + strName + ".*", SearchOption.AllDirectories) : Directory.GetFiles(strCurrentDirectory, "Cover - Front.*", SearchOption.AllDirectories);
                    Array.Sort(strCoverPaths);
                    strCoverPath = strCoverPaths?.FirstOrDefault()?.Replace("\\", "/").Replace(HttpContext.Current.Session["currentDisk"].ToString(), "");
                    //Reduce cover size
                    string outputPath = !directory.Contains("/gallery") ? HttpContext.Current.Session["currentDisk"].ToString() + strCoverPath + "_small.jpg" : strCoverPath;
                    strCoverPath = System.IO.File.Exists(outputPath) ? outputPath.Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/", "/") : ResizeImage(strCoverPath, outputPath);
                }

                strExternalArtist = strLogoPath != null && strLogoPath != "" ? "" : strExternalArtist; // To prevent the logos disappear

                strSection = strFolder.Contains("[Artwork]") ? strSection.Replace(HttpContext.Current.Session["currentServer"].ToString(), HttpContext.Current.Session["currentDisk"].ToString()) : strSection;
                string strClassName = strFolder.Contains("/video") || strFolder.Contains("/library") ? "logo_span_S2" : strLogoPath != null && strLogoPath != "" ? "logo_span_S" : "logo_span_S2";
                string strClassIcon = strFolder.Contains("/video") || strFolder.Contains("/library") ? "icon_span_S2" : strLogoPath != null && strLogoPath != "" ? "icon_span_S" : "icon_span_S2";
                string strClassContainer = strFolder.Contains("/video") || strFolder.Contains("/library") ? "V2" : "S";
                string strSpanContents = strLogoPath != null && strLogoPath != "" && !strFolder.Contains("/video") ? "<img id = 'itemLogo" + intCountItems + "' class='logo_item_S'  src='" + strLogoPath + "' style='width: 80%; height:80%;'></img>" : strName;
                string strNameSpan = strFolder.Contains("/Logos") ? "<span id = 'LogoSpan" + intCountItems + "' class = 'logo_span " + strClassName + " divContentSpan' data-name='" + strName + "'>" + strName.Replace(" Current", "") + "</span>" 
                    : strFolder.Contains("/Photos") ? "<span id = 'LogoSpan" + intCountItems + "' class = 'logo_span " + strClassName + " divContentSpan' data-name='" + strName + "'>" + strName.Substring(9).Replace("_V","").Replace("_H", "") + "</span>" : "<span id = 'LogoSpan" + intCountItems + "' class = 'logo_span " + strClassName + " divContentSpan' data-name='" + strName + "'>" + strSpanContents + "</span>";
                string strDateSpan = strFolder.Contains("/Logos") || strFolder.Contains("[Artwork]") ? "" : strFolder.Contains("/Photos") ? "<span class = 'icon_span " + strClassIcon + " divContentSpan' data-name='" + strName.Substring(0,4) + "'>" + strName.Substring(0, 4) + "</span>" : "<span class = 'icon_span " + strClassIcon + " divContentSpan' data-name='" + strDate + "'>" + strFormattedDate + "</span>";
                strImageURL = strCoverPath != null && strCoverPath != "" ? HttpContext.Current.Session["currentServer"].ToString() + Uri.EscapeDataString(strCoverPath).Replace("%2F", "/") : strImageURL;
                string strTitleTag = "<span id = 'LogoSpan" + intCountItems + "' class = 'item_span item_span_H divContentSpan' data-name='strName" + "'>" + strName + "</span>";
                strInnerHTML += strDate + "<div class='itemBox "+ strReleaseGalleryClass + " item_container item_container_"+ strClassContainer + "' style='margin-bottom:-6px' data-id='" + strName + "' data-url='" + HttpContext.Current.Session["currentServer"].ToString() + Uri.EscapeDataString(strItemPath).Replace("%2F", "/") + "' data-section='" + strSection + "' data-fullname='" + strDate + " " + strName + "'>" +
                            "<div id= 'item2Div" + intCountItems + "' class= 'button_item_"+ strClassContainer + " divContentItem" + intCountItems + "' style='background-image:url(" + strImageURL + "); "+ strBackgroundProps + "'>" +
                            "</div><div class='button_content_S' title = '" + strDate.Substring(0, 4) + ", " + strName + "' style ='margin-top:-280px'>" + strNameSpan + strExternalArtist + strDateSpan + "</div></div>█";
            }

            string[] strHTMLArray = strInnerHTML.Split('█');
            Array.Sort(strHTMLArray);
            strHTMLArray = strHTMLArray.Select(item => item.Length > 11 ? item.Substring(11) : item).ToArray();
            strInnerHTML = string.Join("█", strHTMLArray).Replace("█", "").Replace("%5B", "[").Replace("%5D", "]");

            if (strFolder.Contains("[Artwork]") || isPromoMaterial)
            {
                string strPhotoCont = "", strOtherCont = "";
                int intCountPhoto = 0, intCountOther = 0;
                bool hasOther = false;

                if (!lnkOtherFiles.Contains("NO_DATA") && !isPromoMaterial)
                {
                    Array.Sort(lnkOtherFiles);
                    strReleaseGalleryClass = strFolder.Contains("[Artwork]") ? "classReleaseGallery classRelease-other" : "";
                    foreach (string strFile in lnkOtherFiles)
                    {
                        string strFileName = Path.GetFileNameWithoutExtension(strFile);
                        string strImagePath = strFile.Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/", "http://127.0.0.1:8887/").Replace("\\", "/").Replace("'", "%27");

                        strOtherCont += "<div class='itemBox " + strReleaseGalleryClass + " item_container divOtherItem item_container_Sm' style='margin-bottom:-6px' data-id='RelOther" + intCountOther + "' data-url='" + strImagePath + "' data-section='" + strSection + "' data-fullname='" + strFileName + "'>" +
                            "<div id= 'item3Div" + intCountOther + "' class= 'button_item_Sm divOthertItem" + intCountOther + "'" +
                            "style='background-image:url(\"" + strImagePath + "\"); background-size:contain; background-repeat: no-repeat; background-position:center'>" +
                            "</div></div>";
                        intCountOther++;
                    }
                    strOtherCont = strOtherCont != "" ? "●" + strOtherCont : strOtherCont;
                    hasOther = intCountOther > 0 ? true: false;
                }

                string[] strFieldArr = hasOther == true? "Artwork;Photos;Other".Split(';') : "Artwork;Photos".Split(';');
                //Skip photos for various artists
                if (HttpContext.Current.Session["curArtistID"].ToString() == "120 " || HttpContext.Current.Session["curArtistID"].ToString() == "120")
                {
                    strFieldArr = hasOther == true ? "Artwork;Other".Split(';') : "Artwork".Split(';');
                }
                int intCountFields = 0;
                strGalleryBar = "<div id='filterSearchMainSubItem' class='divSubFilter divSubFilterSearch'>";
                string strActiveClass = "activeSec";

                foreach (string field in strFieldArr)
                {
                    strGalleryBar = strGalleryBar + "<a id='SubMainFilterOpt" + intCountFields + "' class='subfilterOption2 SubFilterMain menuBarButtonSec SubChar " + strActiveClass + "' href='javascript:void(0)' data-field='" + field.ToLower() + "' style='min-width:" + 100 / strFieldArr.Length + "% '>" + field.ToUpper() + "</a>";
                    intCountFields++;
                    strActiveClass = "";
                }
                strGalleryBar = strGalleryBar + "</div>";

                string strPhotoName = HttpContext.Current.Session["curReleaseName"].ToString().Substring(12);
                //Add photos
                string[] strFiles = Directory.GetFiles(HttpContext.Current.Session["currentDisk"].ToString() + "/" + HttpContext.Current.Session["curPageName"] + "/" + charInitialChar + "/" + HttpContext.Current.Session["curArtistName"].ToString() + "/Gallery/Photos");
                Array.Sort(strFiles);
                bool hasPhotoName = strFiles.Any(p =>p.IndexOf(strPhotoName, StringComparison.OrdinalIgnoreCase) >= 0);

                //Missing artist photos in box set selection
                int intReleaseTitleIndex = strFolder.StartsWith("http") && !strFolder.Contains("/Video/") ? 8 : strFolder.Contains("/Video/") ? 7 : 6;
                if (!hasPhotoName && isPromoMaterial)
                {
                    strPhotoName = Path.GetFileNameWithoutExtension(strDirectories[0]).Substring(0, 4);
                }
                if (strFolder.Contains("/Video/") && strFolder.Split('/')[intReleaseTitleIndex].Length < 12 && strFolder.Split('/')[intReleaseTitleIndex -2].Length > 12)
                {
                    intReleaseTitleIndex = intReleaseTitleIndex - 2;
                    strPhotoName = strFolder.Split('/')[intReleaseTitleIndex].Substring(12);
                    hasPhotoName = strFiles.Any(p => p.IndexOf(strPhotoName, StringComparison.OrdinalIgnoreCase) >= 0);
                    if (!hasPhotoName)
                    {
                        strPhotoName = strFolder.Split('/')[intReleaseTitleIndex].Substring(0, 4);
                    }
                }

                else if ((!hasPhotoName && strFolder.Split('/')[intReleaseTitleIndex].Length > 12) || (hasPhotoName && !strFolder.Contains(strPhotoName)))
                {
                    strPhotoName = strFolder.Split('/')[intReleaseTitleIndex].Substring(12);
                    hasPhotoName = strFiles.Any(p => p.IndexOf(strPhotoName, StringComparison.OrdinalIgnoreCase) >= 0);
                    if (!hasPhotoName)
                    {
                        strPhotoName = strFolder.Split('/')[intReleaseTitleIndex].Substring(0, 4);
                    }
                }

                strReleaseGalleryClass = strFolder.Contains("[Artwork]") ? "classReleaseGallery classRelease-photos" : "";
                foreach (string strFile in strFiles)
                {
                    if (strFile.Contains(strPhotoName) && !strFile.Contains("_small."))
                    {
                        string strFileName = Path.GetFileNameWithoutExtension(strFile);
                        string strImagePath = strFile.Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/", "http://127.0.0.1:8887/").Replace("\\", "/").Replace("'", "%27");

                        strPhotoCont += "<div class='itemBox  " + strReleaseGalleryClass + " item_container divPhotoItem item_container_Sm' style='margin-bottom:-6px' data-id='RelImage" + intCountPhoto + "' data-url='" + strImagePath + "' data-section='" + strSection + "' data-fullname='" + strFileName + "'>" +
                            "<div id= 'item2Div" + intCountPhoto + "' class= 'button_item_Sm divContentItem" + intCountPhoto + "'" +
                            "style='background-image:url(\"" + strImagePath + "\"); background-size:cover; background-position:center;'>" +
                            "</div></div>";
                        intCountPhoto++;
                    }
                }
                strPhotoCont = strPhotoCont != "" ? strPhotoCont : "<p style='margin-left:50px'>No photos found</p>";

                strInnerHTML = strGalleryBar + "●" + strInnerHTML + "●" + strPhotoCont + strOtherCont;
            }

            HttpContext.Current.Session["curContent" + strCurrentFolder + HttpContext.Current.Session["curArtistName"].ToString().Replace(" ", "")] = strInnerHTML;
            return strInnerHTML;
        }

        public static string ResizeImage(string strCoverPath, string outputPath, int intDivider = 2, bool isLocal = false)
        {
            // Resize and reduce quality of the image
            strCoverPath = isLocal == false ? HttpContext.Current.Session["currentDisk"].ToString() + strCoverPath : HttpContext.Current.Server.MapPath("~" + strCoverPath);
            using (Bitmap originalImage = new Bitmap(strCoverPath))
            {
                int newWidth = Convert.ToInt32(originalImage.Width / intDivider);  // Resize to half the original width
                int newHeight = Convert.ToInt32(originalImage.Height / intDivider); // Resize to half the original height

                using (Bitmap resizedImage = new Bitmap(originalImage, newWidth, newHeight))
                {
                    // Set the quality level
                    EncoderParameters encoderParameters = new EncoderParameters(1);
                    encoderParameters.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 50L); // Set quality to 50%

                    // Get the JPEG codec
                    ImageCodecInfo jpegCodec = GetEncoder(ImageFormat.Jpeg);

                    // Save the resized image with reduced quality
                    resizedImage.Save(outputPath, jpegCodec, encoderParameters);
                    strCoverPath = outputPath.Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/", "/");
                    return strCoverPath;
                }
            }
        }

        private static ImageCodecInfo GetEncoder(ImageFormat format)
        {
            ImageCodecInfo[] codecs = ImageCodecInfo.GetImageDecoders();
            foreach (ImageCodecInfo codec in codecs)
            {
                if (codec.FormatID == format.Guid)
                {
                    return codec;
                }
            }
            return null;
        }

        public static async Task<string> GetTopTracks(LastfmClient client, DataTable dtBand, string strSource, string strCurColor = "", string update = "", HttpSessionState varSession = null)
        {
            string strTopTrackTitles = "", strTrackPaths = "", strTopTrackFetch = "", strTracksDiv = "";
            if (update == "false")
            {                
                strTopTrackTitles = dtBand.Rows[0][15].ToString() != "" ? "_top100tracks_" + dtBand.Rows[0][15].ToString() : strTopTrackTitles;
                strTrackPaths =  dtBand.Rows[0][14].ToString() != "" ? dtBand.Rows[0][14].ToString() : strTrackPaths;
                if (strTrackPaths != "" && strTopTrackTitles != "")
                {
                    strTopTrackFetch = strTopTrackFetching(strTrackPaths, strSource, strCurColor, varSession);
                    strTracksDiv = strTopTrackFetch.Split('^')[0];
                    return strTracksDiv + "^" + strTrackPaths.Replace("^", ";") + strTopTrackTitles;
                } 
            }
            var pageResponse = await client.Artist.GetTopTracksAsync(dtBand.Rows[0][1].ToString(), page: 1, itemsPerPage: 120);
            string[] strTrackNames = pageResponse.Content.Select(track => track.Name).Distinct().ToArray();
            strTopTrackTitles = string.Join("■", strTrackNames).Replace("'", "%36");
            if (strTopTrackTitles != "")
                ExtServices.UpdateSingleFieldByID("bands", strTopTrackTitles, "bndtop100", "bndID", Convert.ToInt32(dtBand.Rows[0][0].ToString()));
            
            //Top 10 tracks
            string strEncodedName = Uri.UnescapeDataString(dtBand.Rows[0][1].ToString());
            char charInitialCharEnc3 = strEncodedName.ToUpper()[0];
            charInitialCharEnc3 = Char.IsDigit(charInitialCharEnc3) ? '#' : Char.IsSymbol(charInitialCharEnc3) ? '' : charInitialCharEnc3;
            var directories = Directory.GetDirectories(strSource + "/Music/" + charInitialCharEnc3 + "/" + strEncodedName, "*", SearchOption.AllDirectories).SelectMany(dir => Directory.GetDirectories(dir, "*", SearchOption.TopDirectoryOnly)).OrderBy(dir => dir);
            //string[] songPaths = strTrackNames?.Take(10).Select(title => directories?.SelectMany(dir => Directory.GetFiles(dir, $"*{title}*.mp3", SearchOption.TopDirectoryOnly))?.FirstOrDefault()).ToArray();

            var allFiles = directories?.SelectMany(dir => Directory.GetFiles(dir, "*.mp3", SearchOption.TopDirectoryOnly)).ToHashSet(StringComparer.OrdinalIgnoreCase); // Case-insensitive index

            // 2. Filter your track names against the index
            string[] songPaths = strTrackNames?.Select(title => allFiles?.FirstOrDefault(f =>
            f.IndexOf(title, StringComparison.OrdinalIgnoreCase) >= 0))
            .Where(path => path != null)
            .Take(10)
            .ToArray();


            songPaths = songPaths.Where(path => path != null).Select(path => path.Replace("'", "%36").Replace("\\", "/").Replace(strSource, "http://127.0.0.1:8887/")).Distinct().ToArray();
            strTrackPaths = string.Join("^", songPaths);

            if (strTrackPaths != "")
            {
                ExtServices.UpdateSingleFieldByID("bands", strTrackPaths, "bndtoptracks", "bndID", Convert.ToInt32(dtBand.Rows[0][0].ToString()));
                strTopTrackFetch = strTopTrackFetching(strTrackPaths, strSource, strCurColor);
                strTracksDiv = strTopTrackFetch.Split('^')[0];
            }
            strTopTrackTitles = strTopTrackTitles != "" ? "_top100tracks_" + strTopTrackTitles : "";
            return strTracksDiv + "^" + strTrackPaths.Replace("^",";") + strTopTrackTitles;
        }

        public static async Task<string> GetArtistSimilarAndTopTracks(LastfmClient client, DataTable dtBand, string strSource, string strCurColor = "", string strSkipTop = "", string strRefresh = "", string strPageName = "", HttpSessionState varSession = null)
        {
            string strContent = "";
            string strTopTracks = "";
            string strTop100Tracks = "";

            if (strSkipTop == "")
            {
                Task<string> taskTopTracks = Task.Run(() => GetTopTracks(client, dtBand, strSource, strCurColor, strRefresh, varSession));
                taskTopTracks.Wait();

                strTopTracks = taskTopTracks.Result.Split('^')[0];

                if (taskTopTracks.Result.Contains("_top100tracks_"))
                {
                    string[] strTopTrackArr = taskTopTracks.Result.Split(new string[] { "_top100tracks_" }, StringSplitOptions.None);
                    strTop100Tracks = strTopTrackArr[1];
                }
            }

            var pageSimilar = await client.Artist.GetSimilarByMbidAsync(dtBand.Rows[0][2].ToString(), true, 10);
            

            if (pageSimilar.Content.Count == 0)
            {
                //Retrieve by lead vocalist
                DataTable dtParticipations = ExtServices.GetRecordByValues("artistparticipations", " arpFKbands", dtBand.Rows[0][0].ToString(), "artFKinstruments", "1016", "TRUE");
                if (dtParticipations != null && dtParticipations.Rows.Count > 0)
                {
                    DataTable dtArtist = ExtServices.GetRecordByValue("artists", " artID", dtParticipations.Rows[0][2].ToString());
                    pageSimilar = await client.Artist.GetSimilarAsync(dtArtist.Rows[0][3].ToString(), true, 10);

                }
            }

            if (pageSimilar.Content.Count > 0)
            {
                string strSimilarArtistID = "";
                string[] strSimilarArtists = pageSimilar.Content?.Where(item => item.Name?.ToLower() != dtBand.Rows[0][1].ToString().ToLower()).Select(item => item.Name).ToArray();
                DataTable dtSimilarNames = strSimilarArtists.Length > 0 ? ExtServices.GetRecordByValuesSameField("bands", "bndName", '"' + string.Join("\"^\"", strSimilarArtists).Replace("/", " ⁄ ").Replace(',', '■').Replace('\'', '█').Replace('^', ',') + '"') : new DataTable();
                if (dtSimilarNames != null)
                {
                    strSimilarArtistID = string.Join(";", dtSimilarNames?.AsEnumerable().Select(row => row.Field<int>(0)).ToArray());
                }
                
                //if similar artists are found and either there's no value stored in DB or if it's being refreshed
                if (strSimilarArtistID != "" && ((dtBand.Rows[0][8].ToString() == "" && strRefresh == "false") || (strSimilarArtistID != dtBand.Rows[0][8].ToString() && strRefresh == "true"))) 
                {
                    string strNotFound = "", strFilteredSimilarArtistID = "";
                    if (strSimilarArtistID != "")
                    {
                        foreach (string artistID in strSimilarArtistID.Split(';'))
                        {
                            if (artistID.Contains("_not_found"))
                            {
                                strNotFound = strNotFound == "" ? artistID : strNotFound + ";" + artistID;
                                strFilteredSimilarArtistID = strFilteredSimilarArtistID.Replace(";" + artistID, "").Replace(artistID + ";", "").Replace(artistID, "");
                            }
                        }
                    }

                    DataTable dtSimilar = strSimilarArtistID != "" ? ExtServices.GetRecordByValuesSameField("bands", "bndID", strSimilarArtistID.Replace(";",",")) : new DataTable();

                    strContent = PrimaryPage.strGridContent(dtSimilar, "V", "OtherProjectsSim", strNotFound, null, strPageName);

                    if (strContent.Contains("[#SEPARATOR]"))
                    {
                        strContent = strContent.Replace("[#SEPARATOR]", "█");
                        string[] strHTMLArray = strContent.Split('█');
                        Array.Sort(strHTMLArray);

                        for (int i = 0; i < strHTMLArray.Length; i++)
                        {
                            if (strHTMLArray[i].ToString() != "")
                            {
                                strHTMLArray[i] = strHTMLArray[i].ToString();
                            }
                        }

                        strContent = string.Join("█", strHTMLArray);
                        strContent = strContent.Replace("█", "");
                    }

                    ExtServices.UpdateSingleFieldByID("bands", strSimilarArtistID, "bndFKartists", "bndID", Convert.ToInt32(dtBand.Rows[0][0].ToString()));
                }
                else
                {
                    strContent = strTopTracks != "" ? "non_modified_value" : "^non_modified_value";
                }
            }
            strTop100Tracks = strTop100Tracks != "" ? "_top100tracks_" + strTop100Tracks : "";
            return strSkipTop == "" ? strTopTracks + "^" + strContent + strTop100Tracks : strContent + strTop100Tracks;
        }


        public string GetAccessToken()
        {
            //SpotifyToken token = new SpotifyToken();
            string url5 = "https://accounts.spotify.com/api/token";
            var clientid = "your_client_id";
            var clientsecret = "your_client_secret";

            //request to get the access token
            var encode_clientid_clientsecret = Convert.ToBase64String(Encoding.UTF8.GetBytes(string.Format("{0}:{1}", clientid, clientsecret)));

            HttpWebRequest webRequest = (HttpWebRequest)WebRequest.Create(url5);

            webRequest.Method = "POST";
            webRequest.ContentType = "application/x-www-form-urlencoded";
            webRequest.Accept = "application/json";
            webRequest.Headers.Add("Authorization: Basic " + encode_clientid_clientsecret);

            var request = ("grant_type=client_credentials");
            byte[] req_bytes = Encoding.ASCII.GetBytes(request);
            webRequest.ContentLength = req_bytes.Length;

            Stream strm = webRequest.GetRequestStream();
            strm.Write(req_bytes, 0, req_bytes.Length);
            strm.Close();

            HttpWebResponse resp = (HttpWebResponse)webRequest.GetResponse();
            String json = "";
            using (Stream respStr = resp.GetResponseStream())
            {
                using (StreamReader rdr = new StreamReader(respStr, Encoding.UTF8))
                {
                    //should get back a string i can then turn to json and parse for accesstoken
                    json = rdr.ReadToEnd();
                    rdr.Close();
                }
            }
            return ""; //token.access_token;
        }
    }
}