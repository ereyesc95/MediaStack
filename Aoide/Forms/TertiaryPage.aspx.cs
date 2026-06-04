using Hqub.MusicBrainz.API;
using Hqub.MusicBrainz.API.Entities;
using MediaBinger;
using System;
using System.Collections.Generic;
using System.Data;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading.Tasks;
using System.Web;
using System.Web.UI.WebControls;
using Newtonsoft.Json;
using System.Globalization;
using TagLib.Mpeg;
using LyricsScraperNET;
using LyricsScraperNET.Models.Requests;
using System.Xml.Linq;
using System.Threading;
using System.Text.RegularExpressions;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;

namespace Aoide.Forms
{
    public partial class TertiaryPage : System.Web.UI.Page
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
            string strPromoRelease = "";
            int intSkipOverview = 0;
            
            List<string> lstVideoLinks = new List<string>();
            string strFullReleaseName = Session["curReleaseName"].ToString();
            string strMediaType = Session["mediaType"].ToString();
            DataTable dtMenuItems = ExtServices.GetRecordByValue("menuitems", " meiFKcontenttype", Session["curSubPageCode"].ToString().Replace("0", "1"), "meiOrder");
            //Menu items population
            if (dtMenuItems != null && dtMenuItems.Rows.Count > 0)
            {
                string strActive = " activeSec";
                DataTable dtMenuFilters = ExtServices.GetRecordByValue("filters", "filFKcontenttype", Session["curSubPageCode"].ToString(), "filOrder");
                if (dtMenuFilters != null)
                {
                    int intCountElements = dtMenuItems.Rows.Count;
                    //Loop for each main menu item
                    for (int i = 0; i < dtMenuItems.Rows.Count; i++)
                    {
                        if (strFullReleaseName == "01.01.1000. Setlists" && strMediaType == "playlist" && intSkipOverview == 0)
                        {
                            intSkipOverview++;
                            intCountElements--;
                            continue;
                        }
                        barNavSection.InnerHtml = barNavSection.InnerHtml + " <a id='menuItem" + i + "' class='menuBarButtonThi menuOption" + strActive + "' href='javascript:void(0)' data-value='" + dtMenuItems.Rows[i][0] + "' style='min-width:" + 100 / intCountElements + "%' runat='server'>" + dtMenuItems.Rows[i][1].ToString().ToUpper() + "</a>";
                        filterBarSection.InnerHtml = filterBarSection.InnerHtml + "<div id='filterItem" + i + "' class='divSubitem divdivSubitem" + dtMenuItems.Rows[i]["meiID"].ToString() + "' data-value='" + dtMenuItems.Rows[i]["meiID"].ToString() + "' >";
                        //Filter DataTable
                        int intCountSubItems = dtMenuFilters.Select().Where(s => s["filFKmenuitems"].ToString() == dtMenuItems.Rows[i]["meiID"].ToString()).Count();
                        //Loop for each main menu filter
                        filterBarSection.InnerHtml = filterBarSection.InnerHtml + "</div>";
                        strActive = "";
                    }
                }
                if (strMediaType == "playlist" && strFullReleaseName == "01.01.1000. Setlists")
                {
                    divPersonnel.Attributes.Add("style", "display:none");
                    divSingles.Attributes.Add("style", "display:none");
                }
                else if (strMediaType == "playlist")
                {
                    barNavSection.Attributes.Add("style", "display:none");
                    filterBarSection.Attributes.Add("style", "display:none");
                    divPersonnel.Attributes.Add("style", "display:none");
                    divSingles.Attributes.Add("style", "display:none");
                }
            }

            else
            {
                // If no content found
                contentSection.InnerHtml = "<p>No content found yet</p>";
            }

            //Validate url data
            bool isArtistPlaylist = false;
            if (Session["curPath"].ToString().Contains("[playlists]") || Session["curPath"].ToString().Contains("artistplaylist"))
            {
                Session["curPath"] = "artistplaylist";
                isArtistPlaylist = true;
            }
            string strUserPlaylist = Session["curPath"].ToString().Contains("userplaylist") ? "true" : "false";
            string strCurrentItem = Session["curReleaseName"].ToString().Substring(12).Replace(".", "");
            string strCurReleaseDate = Session["curReleaseName"].ToString().Substring(0, 11).Replace(".", "");
            string strCurrentID = Session["curArtistCode"].ToString();
            string strCurrentArtist = Session["curArtistName"].ToString();
            string strReleaseName = Session["curReleaseName"].ToString().Substring(12).Replace("：", ":").Replace("&", "%26").Replace("\'", "'").Replace("·", ".");
            string strExtraArtist = "";
            if (strReleaseName.Contains("[By"))
            {
                int pFrom = strReleaseName.IndexOf("[By ") + "[By ".Length;
                int pTo = strReleaseName.LastIndexOf("]");
                strExtraArtist = strReleaseName.Substring(pFrom, pTo - pFrom);
            }

            string strCurrentUrl = HttpContext.Current.Request.Url.AbsoluteUri;
            string myDecodedString = Uri.UnescapeDataString(strCurrentUrl);
            string strExternalArtist = Session["rel" + strReleaseName.Replace(" ", "")]?.ToString();
            // External artist - Various artists
            if (strExternalArtist != null && strExternalArtist != "")
            {
                myDecodedString = myDecodedString.Replace("/"+ strCurrentArtist + "/", "/" + strExternalArtist + "/");
                strCurrentArtist = strExternalArtist;
                Session["curArtistName"] = strCurrentArtist;
                char charInitialChar = strCurrentArtist.ToUpper()[0];
                Session["curArtistInitial"] = Char.IsDigit(charInitialChar) ? '#' : Char.IsSymbol(charInitialChar) ? '' : charInitialChar;
                DataTable dtExternalBand = ExtServices.GetRecordByValue("bands", " bndName", strCurrentArtist);
                if (dtExternalBand?.Rows.Count > 0)
                {
                    Session["curArtistCode"] = dtExternalBand.Rows[0][2].ToString();
                    Session["curArtistID"] = dtExternalBand.Rows[0][0].ToString();
                }
            }
            string strCurrentUrlItem = myDecodedString.Split('/').Last().Replace("·", ".").Replace("¿", "&");
            string strCurrentReleaseDir = "";
            string strMidDirectory = "";
            int intCheck = 0;
            int intCheckSingle = 0;
            //Update release name according to the url
            //if (strCurrentItem.ToLower() != strCurrentUrlItem.ToLower() && strCurrentUrlItem != "")
            if (strCurrentUrlItem != "")
            {
                if (HttpContext.Current.Session["curPath"].ToString() == "Singles")
                {
                    Session["curPath"] = HttpContext.Current.Session["currentDisk"].ToString() + "/" + HttpContext.Current.Session["curPageName"] + "/" + HttpContext.Current.Session["curArtistInitial"]?.ToString() + "/" + strCurrentArtist + "/audio\\Singles";
                }

               if (strMediaType == "playlist")
                {
                    strReleaseName = strCurrentUrlItem;
                    HttpContext.Current.Session["curReleaseName"] = "01.01.1000. " + strCurrentUrlItem;
                }
                else if (HttpContext.Current.Session["curPath"].ToString().Contains("\\Singles"))
                {
                    string[] strDirectories = Directory.GetDirectories(HttpContext.Current.Session["curPath"].ToString());
                    Array.Sort(strDirectories);
                    foreach (string directory in strDirectories)
                    {
                        if (intCheck == 0)
                        {
                            string[] strSingleDirectories = Directory.GetDirectories(directory);
                            Array.Sort(strSingleDirectories);
                            foreach (string singledirectory in strSingleDirectories)
                            {
                                if (singledirectory.ToLower().Contains(strCurrentUrlItem.ToLower()))
                                {
                                    string strGetDirectory = Uri.UnescapeDataString(directory);
                                    strGetDirectory = strGetDirectory.Split('\\').Last();
                                    string strGetSubDirectory = Uri.UnescapeDataString(singledirectory);
                                    strGetSubDirectory = strGetSubDirectory.Split('\\').Last();

                                    if (strGetSubDirectory == "[Artwork]")
                                    {
                                        strGetSubDirectory = strGetDirectory;
                                    }

                                    if (strGetSubDirectory.ToString().Substring(12).Replace(".", "").ToLower().Contains(strCurrentUrlItem.ToLower()))
                                    {
                                        strReleaseName = strGetSubDirectory.Substring(12).Replace("：", ":").Replace("&", "%26").Replace("\'", "'").Replace("·", ".");
                                        strMidDirectory = strGetDirectory + "/";
                                        Session["curReleaseName"] = strGetSubDirectory;
                                        strCurrentItem = strGetSubDirectory.ToString().Substring(12).Replace(".", "");
                                        intCheck++;
                                        intCheckSingle++;
                                        break;
                                    }
                                }
                            }
                        }
                        else
                        {
                            break;
                        }
                    }
                }

                Session["curArtistPath"] = HttpContext.Current.Session["currentDisk"].ToString() + "/" + HttpContext.Current.Session["curPageName"] + "/" + HttpContext.Current.Session["curArtistInitial"]?.ToString() + "/" + strCurrentArtist;
                string strValues = "";
                //Code to see all of the values in session variables
                foreach (string key in Session.Keys)
                {
                    var value = Session[key];
                    strValues = strValues + "|||" + $"Key: {key}, Value: {value}";
                }

                if ((intCheckSingle == 0 && strMediaType != "playlist" )|| (HttpContext.Current.Session["curIsSingleBox"]?.ToString() == "no" && intCheckSingle == 1 && strMediaType != "playlist" ))
                {
                    if (HttpContext.Current.Session["curIsSingleBox"]?.ToString() == "yes")
                    {
                        Session["curRelSource"] = "/Singles";
                    }
                    string[] strDirectories = Directory.GetDirectories(HttpContext.Current.Session["currentDisk"].ToString() + "/" + HttpContext.Current.Session["curPageName"] + "/" + HttpContext.Current.Session["curArtistInitial"]?.ToString() + "/" + strCurrentArtist, "*", SearchOption.AllDirectories).OrderBy(dir => dir).Where(dir => Path.GetFileName(dir).Contains(strCurrentUrlItem) && dir.Replace("\\","/").Contains(HttpContext.Current.Session["curRelSource"]?.ToString())).ToArray();
                    if (strDirectories.Count() == 0 || (HttpContext.Current.Session["curRelSource"]?.ToString() == "/Singles" && strDirectories.Count() > 0 && HttpContext.Current.Session["curIsSingleBox"]?.ToString() != "yes"))
                    {
                        strDirectories = Directory.GetDirectories(HttpContext.Current.Session["currentDisk"].ToString() + "/" + HttpContext.Current.Session["curPageName"] + "/" + HttpContext.Current.Session["curArtistInitial"]?.ToString() + "/" + strCurrentArtist, "*", SearchOption.AllDirectories).OrderBy(dir => dir).Where(dir => Path.GetFileName(dir).Contains(strCurrentUrlItem)).ToArray();
                        Session["curRelSource"] = "/" + strDirectories?.FirstOrDefault()?.Replace("\\","/").Split('/')[5]?.ToString();
                    }

                    if (strDirectories.Count() == 0 && (Session["curReleaseName"].ToString().Contains("Promo Material") || strValues.Contains("data-name='Promo Material'") ))
                    {
                        DataTable dtPromoVideos = ExtServices.GetRecordByTwoValues("videosource", "visParentID", Session["curArtistID"].ToString(), "visType", "Promo Material", "visID", "ASC");
                        
                        if (dtPromoVideos != null && dtPromoVideos.Rows.Count > 0)
                        {
                            strPromoRelease = "Promo Material";
                            for (int i = 0; i < dtPromoVideos.Rows.Count; i++)
                            {
                                lstVideoLinks.Add(dtPromoVideos.Rows[i][2].ToString() + ";" + dtPromoVideos.Rows[i][3].ToString() + ";" + dtPromoVideos.Rows[i][4].ToString() + ";" + dtPromoVideos.Rows[i][6].ToString());
                            }

                            strDirectories = lstVideoLinks.ToArray();
                        }
                    }
                    
                    Array.Sort(strDirectories);
                    string strReleaseFolder = lstVideoLinks.Count() > 0 ? "Promo Material" : Session["curPath"].ToString().Contains("/video") && strDirectories.Count() > 1 ? strDirectories?.LastOrDefault().Replace("\\", "/") : strDirectories?.FirstOrDefault().Replace("\\", "/");
                    string strGetSubDirectory = lstVideoLinks.Count() > 0 ? "Promo Material" : Uri.UnescapeDataString(strReleaseFolder);
                    string strGetDirectory = lstVideoLinks.Count() > 0 ? "Promo Material" : HttpContext.Current.Session["curRelSource"]?.ToString().Replace("/","");
                    strGetSubDirectory = lstVideoLinks.Count() > 0 ? "Promo Material" : strGetSubDirectory.Split('/').Last();
                    strCurrentReleaseDir = strPromoRelease != "" ? strPromoRelease: Path.GetFileName(strReleaseFolder).Substring(12);
                    Session["curReleaseName"] = lstVideoLinks.Count() > 0 ? Session["curReleaseName"] : strGetSubDirectory;
                    Session["curPath"] = strGetDirectory;
                    Session["curReleaseRootPath"] = strReleaseFolder.Replace("/" + strGetSubDirectory, "");
                    
                    strReleaseName = lstVideoLinks.Count() > 0 ? "Promo Material" : strCurrentReleaseDir.Replace("：", ":").Replace("&", "%26").Replace("\'", "'").Replace("·", ".");
                    Session["curSourceFolder"] = "No";
                }
                else if ((intCheckSingle == 1 && strMediaType != "playlist") || HttpContext.Current.Session["curIsSingleBox"]?.ToString() == "yes")
                {
                    Session["curReleaseRootPath"] = Session["curPath"]?.ToString().Replace("\\","/");
                    Session["curSourceSingle"] = "Yes";
                }

                //from albums to singles search in case intCheck is 0
                if (strReleaseName == "" && strMediaType != "playlist")
                {
                    string[] strDirectories = Directory.GetDirectories(HttpContext.Current.Session["currentDisk"].ToString() + "/" + HttpContext.Current.Session["curPageName"] + "/" + HttpContext.Current.Session["curArtistInitial"]?.ToString() + "/" + strCurrentArtist + "/05. Singles [Music]");
                    Array.Sort(strDirectories);
                    foreach (string directory in strDirectories)
                    {
                        if (intCheck == 0)
                        {
                            string[] strSingleDirectories = Directory.GetDirectories(directory);
                            Array.Sort(strSingleDirectories);
                            foreach (string singledirectory in strSingleDirectories)
                            {
                                if (singledirectory.ToLower().Contains(strCurrentUrlItem.ToLower()))
                                {
                                    string strGetDirectory = Uri.UnescapeDataString(directory);
                                    strGetDirectory = strGetDirectory.Split('\\').Last();
                                    string strGetSubDirectory = Uri.UnescapeDataString(singledirectory);
                                    strGetSubDirectory = strGetSubDirectory.Split('\\').Last();

                                    if (strGetSubDirectory.ToString().Substring(12).Replace(".", "").ToLower().Contains(strCurrentUrlItem.ToLower()))
                                    {
                                        strReleaseName = strGetSubDirectory.Substring(12).Replace("：", ":").Replace("&", "%26").Replace("\'", "'").Replace("·", ".");
                                        strMidDirectory = strGetDirectory + "/";
                                        Session["curReleaseName"] = strGetSubDirectory;
                                        Session["curPath"] = "Singles";
                                        strCurrentItem = strGetSubDirectory.ToString().Substring(12).Replace(".", "");
                                        intCheck++;
                                        intCheckSingle++;
                                        break;
                                    }
                                }
                            }
                        }
                        else
                        {
                            break;
                        }
                    }
                }


                testString.InnerText = strCurrentUrlItem;
                testID.InnerText = strCurrentID;
            }

            Session["curModifiedOrigin"] = "";
            DataTable dtBand = ExtServices.GetRecordByValue("bands", " bndCode", Session["curArtistCode"].ToString());
            string strArtID = Session["curArtistID"]?.ToString().Replace(" ", "");
            string strPosterPath = "";
            string strWallPath = "";
            string strReleaseLogo = "";
            string strDiscPath = "";
            string strPrevRel = "";
            string strNextRel = "";
            string strRelType = "";
            List<string> lstDirectories = new List<string>();
            List<string> lstPosters = new List<string>();
            List<string> lstWalls = new List<string>();
            List<string> lstPaths = new List<string>();
            
            string strPromoFolder = HttpContext.Current.Session["currentDisk"].ToString() + "/" + HttpContext.Current.Session["curPageName"] + "/" + HttpContext.Current.Session["curArtistInitial"]?.ToString() + "/" + HttpContext.Current.Session["curArtistName"] + "/Video";
            string[] strPromoFiles = Directory.Exists(strPromoFolder) ? Directory.GetFiles(strPromoFolder, "*Promo Material.jpg", SearchOption.AllDirectories): null;
            bool promoMaterialExists = strPromoFiles != null && strPromoFiles.Count() > 0 && Session["curReleaseRootPath"] != null && (Session["curReleaseRootPath"].ToString().ToLower().Contains("/video") || Session["curReleaseRootPath"].ToString().Contains("Promo Material")) ? true : false;

            string strCurArtist = strExtraArtist == "" ? strUserPlaylist == "true" ? Session["curArtistName"].ToString() : dtBand.Rows[0][1].ToString() : strExtraArtist;
            string strCurReleaseName = HttpContext.Current.Session["curReleaseName"].ToString().Contains("[By") ? HttpContext.Current.Session["curReleaseName"].ToString().Replace(" [By ", "").Replace(strExtraArtist, "").Replace("]", "") : HttpContext.Current.Session["curReleaseName"].ToString();
            string strReleasePath = strMediaType != "playlist" ? Session["curPath"].ToString() : "";
            strReleasePath = strMediaType != "playlist" ? Session["curReleaseRootPath"].ToString() : strReleasePath;
            string strScansPath = "";
            string strInnerDirectory = "";
            string strInnerDirectoryWithDate = "";
            int intCountDirectory = 0;

            string strSourceFolderPath = strReleasePath;
            //Prev and Next releases
            if (strReleasePath == "Promo Material")
            {
                strSourceFolderPath = HttpContext.Current.Session["currentDisk"].ToString() + "/" + HttpContext.Current.Session["curPageName"] + "/" + HttpContext.Current.Session["curArtistInitial"]?.ToString() + "/" + strCurrentArtist + "/Video";
            }

            string[] strDirectoriesMain = strUserPlaylist != "true"  && isArtistPlaylist == false ? Directory.GetDirectories(strSourceFolderPath) : new string[0];
            if (intCheckSingle == 1 && strDirectoriesMain?.Count() > 0)
            {
                strDirectoriesMain = strDirectoriesMain.SelectMany(folder => Directory.GetDirectories(folder)).ToArray();
                strDirectoriesMain = strDirectoriesMain.Select(path =>
                {
                    string folderName = Path.GetFileName(path);
                    return folderName.Equals("[Artwork]", StringComparison.OrdinalIgnoreCase) ||
                       folderName.IndexOf(" Edition", StringComparison.OrdinalIgnoreCase) >= 0
                        ? Directory.GetParent(path)?.FullName.Replace('\\', '/')
                        : path.Replace('\\', '/');
                })
                .Distinct() // prevent duplicates if multiple [Artwork] folders exist
                .ToArray();

                //Filter editions of standalone singles
                strDirectoriesMain = strDirectoriesMain.Select((path, index) => new { path, index })
                    .Where(item =>
                    {
                        if (item.index == 0) return true;
                        var currentPath = item.path;
                        var prevPath = strDirectoriesMain[item.index - 1];
                        var currentParent = Path.GetFileName(Path.GetDirectoryName(currentPath));
                        var previousEnd = Path.GetFileName(prevPath);
                        var currentDepth = currentPath.Count(c => c == '/');
                        var previousDepth = prevPath.Count(c => c == '/');
                        return !(currentParent == previousEnd && currentDepth > previousDepth);
                    })
                    .Select(item => item.path).ToArray();
            }
            Array.Sort(strDirectoriesMain);
            DataTable dtPlaylistArtist = strUserPlaylist == "true" ? ExtServices.GetRecordByValue("playlists", " plaType", "200") : ExtServices.GetRecordByValue("playlists", " plaType", "201");
            //For playlists
            if (strMediaType == "playlist")
            {
                if (dtPlaylistArtist != null && dtPlaylistArtist.Rows.Count > 0)
                {
                    string[] arrPlaylistIDs = new string[dtPlaylistArtist.Rows.Count];
                    string[] arrPlaylistNames = new string[dtPlaylistArtist.Rows.Count];
                    for (int i = 0; i < dtPlaylistArtist.Rows.Count; i++)
                    {
                        arrPlaylistIDs[i] = dtPlaylistArtist.Rows[i][0].ToString();
                        arrPlaylistNames[i] = dtPlaylistArtist.Rows[i][1].ToString();
                        if (strUserPlaylist == "true" || (HttpContext.Current.Session["playlist" + i + "ID" + strArtID] != null && HttpContext.Current.Session["playlist" + i + "ID" + strArtID].ToString() != ""))
                        {
                            lstDirectories.Add("01.01.1000. " + dtPlaylistArtist.Rows[i][1].ToString());
                        }
                    }
                    strDirectoriesMain = arrPlaylistNames;
                }
            }
            //For regular releases
            else
            {
                lstDirectories = strDirectoriesMain.Select(folderPath => Path.GetFileName(folderPath)).ToList();
            }
            if (strCurReleaseName == "Promo Material" || strCurReleaseName.Contains (". Promo Material"))
            {
                lstDirectories.Add(Session["curReleaseName"].ToString());
            }
            else if (promoMaterialExists)
            {
                lstDirectories.Add("1000.01.01. Promo Material");
                if (Session["curReleaseRootPath"].ToString() == "Promo Material")
                {
                    strCurReleaseName = Session["curReleaseRootPath"].ToString();
                }
            }

            for (int i = 0; i < lstDirectories.Count; i++)
            {
                if (lstDirectories[i].ToLower().Contains(strCurReleaseName.ToLower()))
                {
                    strPrevRel = lstDirectories.ElementAtOrDefault(i - 1) != null ? lstDirectories[i - 1].ToString() : lstDirectories[lstDirectories.Count - 1].ToString();
                    strNextRel = lstDirectories.ElementAtOrDefault(i + 1) != null ? lstDirectories[i + 1].ToString() : lstDirectories[0].ToString();
                    string strPrevPlay = "";
                    string strNextPlay = "";

                    if (strUserPlaylist == "true")
                    {
                        DataTable dtPrevPlay =  ExtServices.GetRecordByTwoValues("playlists", "plaType", "200", "plaName", strPrevRel.Substring(12), "plaID", "ASC");
                        DataTable dtNextPlay =  ExtServices.GetRecordByTwoValues("playlists", "plaType", "200", "plaName", strNextRel.Substring(12), "plaID", "ASC");

                        strPrevPlay = "userPlaylist|" + dtPrevPlay.Rows[0][0].ToString() + "|" + dtPrevPlay.Rows[0][1].ToString();
                        strNextPlay = "userPlaylist|" + dtNextPlay.Rows[0][0].ToString() + "|" + dtNextPlay.Rows[0][1].ToString();
                    }

                    else
                    {
                        strPrevPlay = strPrevRel.Substring(12);
                        strNextPlay = strNextRel.Substring(12);
                    }
                    string strPrevRelYear = strPrevRel.Substring(0, 4) == "1000" ? "" : " (" + strPrevRel.Substring(0, 4) + ")";
                    string strNextRelYear = strNextRel.Substring(0, 4) == "1000" ? "" : " (" + strNextRel.Substring(0, 4) + ")";
                    aRelPrev.Attributes.Add("data-value", strPrevPlay);
                    aRelPrev.Title = strMediaType == "playlist" ? strPrevRel.Substring(12) : strPrevRel.Substring(12) + strPrevRelYear;
                    aRelNext.Attributes.Add("data-value", strNextPlay);
                    aRelNext.Title = strMediaType == "playlist" ? strNextRel.Substring(12) : strNextRel.Substring(12) + strNextRelYear;
                    break;
                }
            }

            if (HttpContext.Current.Session["curPath"].ToString().Contains("Singles"))
            {
                string[] strDirectories = Directory.GetDirectories(strReleasePath);
                Array.Sort(strDirectories);
                foreach (string directory in strDirectories)
                {
                    if (intCountDirectory == 0)
                    {
                        string[] strSubDirectories = Directory.GetDirectories(directory);
                        Array.Sort(strSubDirectories);
                        foreach (string subdirectory in strSubDirectories)
                        {
                            if (subdirectory.ToLower().Contains(strCurReleaseName.ToLower()))
                            {
                                strInnerDirectory = Uri.UnescapeDataString(directory);
                                strInnerDirectory = strInnerDirectory.Split('\\').Last();

                                strReleasePath = strReleasePath + "/" + strInnerDirectory;
                                strInnerDirectoryWithDate = strInnerDirectory;
                                intCountDirectory++;
                                break;
                            }
                        }
                    }
                    else
                    {
                        break;
                    }
                }
            }

            strReleasePath = Directory.Exists(strReleasePath + "/" + strCurReleaseName.Replace("\'", "'").Replace("\\", "/")) ? strReleasePath + "/" + strCurReleaseName.Replace("\'", "'").Replace("\\", "/") : strReleasePath;
            bool isStandalone = false;
            //Standalone singles
            DirectoryInfo dirStandAloneSingle = strReleasePath != "" ? new DirectoryInfo(strReleasePath) : null;
            string parentName = dirStandAloneSingle?.Parent?.Name;
            if (parentName == "Singles" && HttpContext.Current.Session["curPath"].ToString().Contains("Singles") && !Directory.Exists(strReleasePath + "/" + strCurReleaseName.Replace("\'", "'").Replace("\\", "/")))
            {
                isStandalone = true;
            }

            //Retrieve image for left side
            string strResponseSetlist = Session["playlist11" + "ID" + strArtID]?.ToString(); //Total of setlists
            string strSelectYear = "", strTracks = "", strSelectSetlist = "";
            if (strMediaType == "playlist")
            {
                if (strCurReleaseName == "01.01.1000. Setlists")
                {
                    //Loop through activity years to populate dropdown
                    string strYearOptions = "";
                    int intStartYear = Session["curStartDate"] != null ? Convert.ToInt32(Session["curStartDate"]) : 1900;
                    int intEndYear = Session["curEndDate"] != null ? Convert.ToInt32(Session["curEndDate"]) : DateTime.Now.Year;
                    
                    string strSelectedClass = "selected";
                    for (int i = intEndYear; i >= intStartYear; i--)
                    {
                        if (Session["curSelectedYear"] != null && Session["curSelectedYear"].ToString() != "")
                        {
                            strSelectedClass = "";
                            if (Convert.ToInt32(Session["curSelectedYear"].ToString()) == i)
                            {
                                strSelectedClass = "selected";
                            }
                        }
                        strYearOptions += "<option value='" + i + "' "+ strSelectedClass + ">" + i + "</option>";
                        strSelectedClass = "";
                    }
                    strSelectYear = "<div id='selectSetlistYear' class='divSubFilter divSubFilterSelect' style='margin-top:-17px' data-value='" + "YEAR" + "'>"
                        + "<select id='YearOptSelect' class='form-control inputField input-sm select2' data-id='0' data-table='" + "NONE" + "' data-field='" + "NONE" + "' style='width:90px' >"
                        + strYearOptions + "</select></div>";
                    //Get options from each setlist, send most recent year
                    if (Session["curSelectedYear"] != null && Session["curSelectedYear"].ToString() != "")
                    {
                        intEndYear = Convert.ToInt32(Session["curSelectedYear"].ToString());
                    }
                    Session["curSelectedYear"] = intEndYear.ToString();
                    List<string> lstSetlistTracks = SetlistSelect(intEndYear.ToString()).GetAwaiter().GetResult();
                    
                    if (lstSetlistTracks != null && lstSetlistTracks.Count > 0)
                    {
                        strTracks = lstSetlistTracks.FirstOrDefault();
                        strSelectSetlist = lstSetlistTracks.LastOrDefault();
                        Session["playlist11" + "ID" + strArtID] = strTracks;
                    }
                }
                //divContainerLeft.Attributes.Add("title", HttpContext.Current.Session["curReleaseName"].ToString());
                imgCover.Src = "/Images/Playlists/" + strCurReleaseName.Replace("01.01.1000. ", "") + ".jpg";
                imgDisc.Src = "/Images/System/Disc.png";

                txtCover.Value = imgCover.Src;
                txtDisc.Value = imgDisc.Src;
                txtBack.Value = imgCover.Src;

                bodyThirdPage.Attributes.Add("style", "background-image: url('" + imgCover.Src + "')");
                //spaType.InnerHtml = "<p class='pSpaAlbum' style='display: table;margin: 0 auto;margin-top:-15px'><a class='aSpaAlbum pSpaType aBandPage style='text-decoration: none'>" + strReleaseType + " by </a><a class='aBandPage coloredText aSpaAlbum' data-value='" + strCurArtist + "' style='font-weight:bold; text-decoration: none; cursor:pointer'>‎ " + strCurArtist + "</a></p>";

                txtRelease.Value = strCurReleaseName.Substring(12);
                txtArtistName.Value = strCurArtist;
                txtArtistID.Value = Session["curArtistCode"].ToString();

                //fill tracklist for playlists
                string strContentTrack = "";
                string strPlaylistTracks = "";
                DataTable dtPlaylistArtistRow = strUserPlaylist == "true" ? ExtServices.GetRecordByTwoValues("playlists", "plaName", strCurReleaseName.Replace("01.01.1000. ", ""), "plaType", "200", "plaID"): ExtServices.GetRecordByValue("playlists", " plaName", strCurReleaseName.Replace("01.01.1000. ", ""));
                if (dtPlaylistArtistRow != null && dtPlaylistArtistRow.Rows.Count > 0)
                {
                    for (int i = 0; i < dtPlaylistArtistRow.Rows.Count; i++)
                    {
                        if (strUserPlaylist != "true" && dtPlaylistArtistRow.Rows[i][2].ToString() == "201")
                        {
                            strPlaylistTracks = Session["playlist" + dtPlaylistArtistRow.Rows[i][0] + "ID" + strArtID].ToString();
                            break;
                        }
                        if (strUserPlaylist == "true")
                        {
                            //Most played playlist
                            Session["curPath"] = Session["curPath"].ToString().Replace(" ", "");
                            if (Session["curPath"].ToString() == "userplaylist17")
                            {
                                DataTable dtPlaylistUserRow = ExtServices.GetRecordByValue("reproductions", " repMediaType", "200","repReproductions","DESC","30");
                                if (dtPlaylistUserRow != null && dtPlaylistUserRow.Rows.Count > 0)
                                {
                                    for (int j = 0; j < dtPlaylistUserRow.Rows.Count; j++)
                                    {
                                        strPlaylistTracks = strPlaylistTracks == "" ? dtPlaylistUserRow.Rows[j][6].ToString() : strPlaylistTracks + '■' + dtPlaylistUserRow.Rows[j][6].ToString();
                                    }
                                }
                            }
                            else
                            {
                                DataTable dtPlaylistUserRow = ExtServices.GetRecordByValue("playlistdata", " pldPlaylist", Session["curPath"].ToString().Replace("userplaylist", ""));
                                if (dtPlaylistUserRow != null && dtPlaylistUserRow.Rows.Count > 0)
                                {
                                    for (int j = 0; j < dtPlaylistUserRow.Rows.Count; j++)
                                    {
                                        strPlaylistTracks = strPlaylistTracks == "" ? dtPlaylistUserRow.Rows[j][4].ToString() : strPlaylistTracks + '■' + dtPlaylistUserRow.Rows[j][4].ToString();
                                    }
                                }
                            }
                        }
                    }
                }
                string strIsArtistPlaylist = isArtistPlaylist ? "1" : "";
                strContentTrack = GetPlaylistTracklist(strPlaylistTracks, strCurReleaseName, strUserPlaylist, strIsArtistPlaylist);
                string strPlaylistDesc = strContentTrack.Split('®')[1];
                strContentTrack = strContentTrack.Split('®')[0];
                string strDescStyle = "", strPWidth = "";
                if (strCurReleaseName == "01.01.1000. Setlists")
                {
                    strDescStyle = "style='display: flex; gap:10px'";
                    strPWidth = "style='width:100%'";
                    divContainerTracks.InnerHtml = "<div class='playlistDesc' " + strDescStyle + "><p " + strPWidth + ">" + strSelectYear + strSelectSetlist + "</p></div>" + strContentTrack;
                }
                else
                {
                    divContainerTracks.InnerHtml = "<div class='playlistDesc' "+ strDescStyle + "><p "+ strPWidth + ">" + strPlaylistDesc + strSelectYear + strSelectSetlist + "</p></div>" + strContentTrack;
                }
                
                divContainerTracks.Visible = true;
            }
            else if (dtBand != null && Directory.Exists(strReleasePath) || strReleasePath == "Promo Material")
            {
                //Get directories
                if (strReleasePath == "Promo Material")
                {
                    // Search for the file recursively
                    string[] allFiles = Directory.GetFiles(strSourceFolderPath, "*" + strReleasePath + ".jpg", SearchOption.AllDirectories);
                    strPosterPath = allFiles.FirstOrDefault();
                    strWallPath = allFiles.FirstOrDefault();

                    imgCover.Src = strPosterPath.Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/", "http://127.0.0.1:8887/").Replace("\\", "/").Replace("'", "%27");
                    imgDisc.Src = System.IO.File.Exists(HttpContext.Current.Server.MapPath("~/Images/System/") + "Disc.png") ? "/Images/System/" + "Disc.png" : "";
                    strDiscPath = imgDisc.Src.ToString();
                    txtCover.Value = strPosterPath.Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/", "http://127.0.0.1:8887/").Replace("\\", "/").Replace("'", "%27");
                    txtDisc.Value = strDiscPath.Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/", "http://127.0.0.1:8887/").Replace("\\", "/").Replace("'", "%27");
                    txtBack.Value = strWallPath.Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/", "http://127.0.0.1:8887/").Replace("\\", "/").Replace("'", "%27");
                    bodyThirdPage.Attributes.Add("style", "background-image: url('" + strWallPath.Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/", "http://127.0.0.1:8887/").Replace("\\", "/").Replace("'", "%27") + "')");
                }

                else
                {
                    string[] strDirectories = Directory.GetDirectories(strReleasePath);
                    Array.Sort(strDirectories);
                    string strDirectoryNames = "";
                    strPosterPath = System.IO.File.Exists(strReleasePath + "/[Artwork]/Cover - Front.jpg") ? strReleasePath + "/[Artwork]/Cover - Front.jpg" : System.IO.File.Exists(strReleasePath + "/[Artwork]/Cover - Front.png") ? strReleasePath + "/[Artwork]/Cover - Front.png" : "/Images/System/poster_V.jpg";
                    strWallPath = System.IO.File.Exists(strReleasePath + "/[Artwork]/Cover - Inner.jpg") ? strReleasePath + "/[Artwork]/Cover - Inner.jpg" : System.IO.File.Exists(strReleasePath + "/[Artwork]/Cover - Back.png") ? strReleasePath + "/[Artwork]/Cover - Back.png" : strPosterPath.Replace("_V", "_H");

                    foreach (string directory in strDirectories)
                    {
                        strDirectoryNames = strDirectoryNames == "" ? directory.Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/" + HttpContext.Current.Session["curPageName"] + "/" + HttpContext.Current.Session["curArtistInitial"]?.ToString() + "/" + strCurArtist, "") : strDirectoryNames + ";" + directory.Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/" + HttpContext.Current.Session["curPageName"] + "/" + HttpContext.Current.Session["curArtistInitial"]?.ToString() + "/" + strCurArtist, "");
                        if (directory.Contains("Standard Edition"))
                        {
                            strPosterPath = System.IO.File.Exists(directory + "/[Artwork]/Cover - Front.jpg") ? directory + "/[Artwork]/Cover - Front.jpg" : System.IO.File.Exists(directory + "/[Artwork]/Cover - Front.jpg") ? directory + "/[Artwork]/Cover - Front.jpg" : "/Images/System/poster_V.jpg";
                            strWallPath = System.IO.File.Exists(directory + "/[Artwork]/Cover - Inner.jpg") ? directory + "/[Artwork]/Cover - Inner.jpg" : System.IO.File.Exists(directory + "/[Artwork]/Cover - Back.jpg") ? directory + "/[Artwork]/Cover - Back.jpg" : strPosterPath.Replace("_V", "_H");
                            strReleaseLogo = System.IO.File.Exists(directory + "/[Artwork]/Logo.png") ? directory + "/[Artwork]/Logo.png" : strReleaseLogo;
                            strDiscPath = System.IO.File.Exists(directory + "/[Artwork]/Disc.png") ? directory + "/[Artwork]/Disc.png" : strDiscPath;
                            strScansPath = directory + "/[Artwork]";
                            break;
                        }
                        else if (directory.Contains("[Artwork]"))
                        {
                            strPosterPath = System.IO.File.Exists(directory + "/Cover - Front.jpg") ? directory + "/Cover - Front.jpg" : System.IO.File.Exists(directory + "/Cover - Front.jpg") ? directory + "Cover - Front.jpg" : "/Images/System/poster_V.jpg";
                            strWallPath = System.IO.File.Exists(directory + "/Cover - Inner.jpg") ? directory + "/Cover - Inner.jpg" : System.IO.File.Exists(directory + "/Cover - Back.jpg") ? directory + "/Cover - Back.jpg" : strPosterPath.Replace("_V", "_H");
                            strReleaseLogo = System.IO.File.Exists(directory + "/Logo.png") ? directory + "/Logo.png" : strReleaseLogo;
                            strDiscPath = System.IO.File.Exists(directory + "/Disc.png") ? directory + "/Disc.png" : System.IO.File.Exists(directory + "/Disc 1.png") ? directory + "/Disc 1.png" : strDiscPath;
                            strScansPath = directory;
                            break;
                        }

                    }

                    subMenuItems.Value = strDirectoryNames;

                    //divContainerLeft.Attributes.Add("title", HttpContext.Current.Session["curReleaseName"].ToString());
                    imgCover.Src = strPosterPath.Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/", "http://127.0.0.1:8887/").Replace("\\", "/").Replace("'", "%27");
                    imgDisc.Src = strDiscPath != "" ? strDiscPath.Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/", "http://127.0.0.1:8887/").Replace("\\", "/").Replace("'", "%27") : System.IO.File.Exists(HttpContext.Current.Server.MapPath("~/Images/System/") + "Disc.png") ? "/Images/System/" + "Disc.png" : "";
                    HttpContext.Current.Session["[Release]"] = imgCover.Src.Replace("/" + imgCover.Src.Split('/').Last(), "");
                    txtCover.Value = strPosterPath.Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/", "http://127.0.0.1:8887/").Replace("\\", "/").Replace("'", "%27");
                    txtDisc.Value = strDiscPath.Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/", "http://127.0.0.1:8887/").Replace("\\", "/").Replace("'", "%27");
                    txtBack.Value = strWallPath.Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/", "http://127.0.0.1:8887/").Replace("\\", "/").Replace("'", "%27");

                    //divContainerLeft.Attributes.Add("title", HttpContext.Current.Session["curReleaseName"].ToString());
                    //divContainerLeft.Attributes.Add("style", "background-image: url('" + strPosterPath.Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/", "http://127.0.0.1:8887/").Replace("\\", "/").Replace("'", "%27") + "')");
                    bodyThirdPage.Attributes.Add("style", "background-image: url('" + strWallPath.Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/", "http://127.0.0.1:8887/").Replace("\\", "/").Replace("'", "%27") + "')");
                }
                
                //Check for spotify barcode
                if (System.IO.File.Exists(strScansPath + "/QR.png") && System.IO.File.Exists(strScansPath + "/QR.png"))
                {
                    strScansPath = strScansPath.Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/", "http://127.0.0.1:8887/").Replace("\\", "/").Replace("'", "%27").Replace(".", "%2E");
                    codeSpotify.Src = strScansPath + "/Spotify.png";
                    codeQR.Src = strScansPath + "/QR.png";
                    divExtraData.Attributes.Add("style", "display:none");
                    divQR.Attributes.Add("style", "display:none");
                }

                else if (System.IO.File.Exists(strScansPath + "/Spotify.png"))
                {
                    divQR.Attributes.Add("style", "display:none");
                    divCodes.Attributes.Add("style", "display:none");
                    strScansPath = strScansPath.Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/", "http://127.0.0.1:8887/").Replace("\\", "/").Replace("'", "%27").Replace(".", "%2E");
                    divExtraData.Attributes.Add("style", "background-image: url('" + strScansPath + "/Spotify.png" + "');background-size:cover; background-position:center top;max-width: 400px;min-height: 80px;margin: 0 auto;margin-top:5px;drop-shadow(5px 5px 5px #222222)");
                }

                else if (System.IO.File.Exists(strScansPath + "/QR.png"))
                {
                    divExtraData.Attributes.Add("style", "display:none");
                    divCodes.Attributes.Add("style", "display:none");
                    strScansPath = strScansPath.Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/", "http://127.0.0.1:8887/").Replace("\\", "/").Replace("'", "%27").Replace(".", "%2E");
                    divQR.Attributes.Add("style", "background-image: url('" + strScansPath + "/QR.png" + "');background-size:cover; background-position:center top;max-width: 80px;min-height: 80px;margin: 0 auto;margin-top:5px;drop-shadow(5px 5px 5px #222222)");
                }
                else
                {
                    //If release does not have spotify nor qr codes
                    divExtraData.Attributes.Add("style", "display:none");
                    divCodes.Attributes.Add("style", "display:none");
                }

                //Release data
                if (HttpContext.Current.Session["curPath"].ToString() == "")
                {
                    HttpContext.Current.Session["curPath"] = strCurReleaseName;
                }
                string strReleaseType = strReleasePath == "Promo Material" ? "Promo Material" : HttpContext.Current.Session["curPath"].ToString().Substring(0, HttpContext.Current.Session["curPath"].ToString().Length - 1);
                strRelType = strReleaseType.Contains("\\Single") ? "Single" : strReleasePath.Contains("/Video/") || strReleasePath == "Promo Material" ? "Video Series" : strReleaseType;
                spaType.InnerHtml = "<p class='pSpaAlbum' style='display: table;margin: 0 auto;margin-top:-15px'><a class='aSpaAlbum pSpaType aBandPage style='text-decoration: none'>" + strRelType + " by </a><a class='aBandPage coloredText aSpaAlbum' data-value='" + strCurArtist + "' style='font-weight:bold; text-decoration: none; cursor:pointer'>‎ " + strCurArtist + "</a></p>";

                if (!isStandalone && strInnerDirectory != "" && (strReleaseType == "Single" || strReleaseType.Contains("\\Single")))
                {
                    spaTaken.InnerHtml = "<p class='pSpaAlbum' style='display: table;margin: 0 auto;'><a class='aSpaAlbum pSpaTaken' style='text-decoration: none; padding-right:6px'>Taken from</a><a class='aAlbumPageAnchor aSpaAlbum coloredText isNotSingle' style='font-weight:bold;text-decoration: none; cursor:pointer'>" + strInnerDirectory.Substring(12) + "</a></p>";
                }

                CultureInfo provider = CultureInfo.InvariantCulture;
                strCurReleaseName = strCurReleaseName == "Promo Material" ? strFullReleaseName : strCurReleaseName;
                string strDate = strCurReleaseName.Substring(0, 11);
                string strFormattedDate = strDate.Remove(strDate.Length - 1).Replace(".", "-");
                DateTime dtDate = DateTime.ParseExact(strFormattedDate, new string[] { "yyyy.MM.dd", "yyyy-MM-dd" }, provider, DateTimeStyles.None);
                strFormattedDate = dtDate.ToString("MMMM dd, yyyy");

                spaDate.InnerHtml = "<p class='pSpaAlbum' style='display: table;margin: 0 auto;'><a class='pSpaDate aSpaAlbum' style='text-decoration: none'>Released in " + strFormattedDate + "</a></p>";

                txtRelease.Value = strCurReleaseName.Substring(12);
                txtArtistName.Value = strCurArtist;
                txtArtistID.Value = Session["curArtistCode"].ToString();

                //review
                TextInfo textInfo = new CultureInfo("en-US", false).TextInfo;
                DataTable dtLinks = ExtServices.GetRecordByValue("videosource", "visParentID", dtBand.Rows[0][0].ToString());
                if (dtLinks != null && dtLinks.Rows.Count > 0)
                {
                    for (int i = 0; i < dtLinks.Rows.Count; i++)
                    {
                        if (!Session["curPath"].ToString().Contains("Singles") && dtLinks.Rows[i][3].ToString() == strCurReleaseName.Substring(12) + " Review" && dtLinks.Rows[i][5].ToString() == "Reviews")
                        {
                            string strSiteName = dtLinks.Rows[i][4].ToString().Replace("https://", "").Replace("http://", "").Replace("www.", "");
                            strSiteName = strSiteName.Substring(0, strSiteName.IndexOf("."));
                            spaRev.InnerHtml = "<p class='pSpaAlbum' style='display: table;margin: 0 auto;margin-top:-5px'><a href='" + dtLinks.Rows[i][4].ToString() + "' target='_blank' class='aSpaAlbum pSpaRev coloredText' style='font-weight:bold;text-decoration: none; cursor:pointer;'>Review by " + textInfo.ToTitleCase(strSiteName) + "</a></p>";
                            break;
                        }
                        else if (Session["curPath"].ToString().Contains("05. Singles [Music]") && dtLinks.Rows[i][3].ToString() == strCurReleaseName.Substring(12) && dtLinks.Rows[i][5].ToString() == "Music Video")
                        {
                            string strSiteName = dtLinks.Rows[i][6].ToString() != "" ? dtLinks.Rows[i][6].ToString() : strCurrentArtist;
                            spaRev.InnerHtml = "<p class='pSpaAlbum' style='display: table;margin: 0 auto;margin-top:-5px'><a href='" + dtLinks.Rows[i][4].ToString().Replace("/watch?v=", "/embed/") + "?fs=1&autoplay=1" + "' target='_blank' class='aSpaAlbum pSpaRev coloredText' style='font-weight:bold;text-decoration: none; cursor:pointer;'>Music Video by " + textInfo.ToTitleCase(strSiteName) + "</a></p>";
                            break;
                        }
                    }
                }
            }

            //Top logo
            string strLogoPath = "";
            string strIconPath = "";
            string strReleaseYear = strMediaType != "playlist" ? HttpContext.Current.Session["curReleaseName"].ToString().Substring(0, 4) : DateTime.Now.Year.ToString();
            List<string> lstIcons = Directory.Exists(Session["curArtistPath"].ToString() + "/Gallery/Logos") ? Directory.GetFiles(Session["curArtistPath"].ToString() + "/Gallery/Logos")?.OrderBy(file => file).Where(file => Path.GetFileName(file).Contains("Icon ")).Select(file => Path.GetFileName(file)).ToList() : new List<string>();
            List<string> lstLogos = Directory.Exists(Session["curArtistPath"].ToString() + "/Gallery/Logos") ? Directory.GetFiles(Session["curArtistPath"].ToString() + "/Gallery/Logos")?.OrderBy(file => file).Where(file => Path.GetFileName(file).Contains("Logo ")).Select(file => Path.GetFileName(file)).ToList() : new List<string>();
            string[] filesLogo = Directory.Exists(Session["curArtistPath"].ToString() + "/Gallery/Logos") ? Directory.GetFiles(Session["curArtistPath"].ToString() + "/Gallery/Logos").Where(file => !file.EndsWith(".ini")).ToArray() : new string[0];
            Array.Sort(filesLogo);
            string strEncodedNameBand = dtBand != null ? Uri.UnescapeDataString(dtBand.Rows[0][1].ToString()) : "";
            if (dtBand != null && Directory.Exists(Session["curArtistPath"].ToString() + "/Gallery/Logos"))
            {                
                foreach (string file in filesLogo)
                {
                    if (file.ToLower().Contains("signature."))
                    {
                        continue;
                    }
                    if (strIconPath != "" && strLogoPath != "")
                    {
                        break;
                    }

                    string strFileName = Path.GetFileName(file).Replace(".png", "").Replace("Icon [", "").Replace("Logo [", "");
                    string strYear1 = strFileName.Substring(0, 4);
                    string strYear2 = "";

                    if (file.Contains("Icon") && strIconPath == "")
                    {
                        strYear2 = strFileName.Contains("-") ? strFileName.Replace("Icon [", "").Replace(strYear1 + "-", "").Substring(0, 4) : "";
                        if (strYear2 != "" && Convert.ToInt32(strReleaseYear) >= Convert.ToInt32(strYear1) && (Convert.ToInt32(strReleaseYear) <= Convert.ToInt32(strYear2) || strFileName.Contains(" Current")))
                        {
                            strIconPath = file.Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/", "http://127.0.0.1:8887/").Replace("\\", "/");
                        }
                        else if (Convert.ToInt32(strReleaseYear) == Convert.ToInt32(strYear1))
                         {
                            strIconPath = file.Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/", "http://127.0.0.1:8887/").Replace("\\", "/");
                         }
                    }
                    else if (file.Contains("Logo"))
                    {
                        strYear2 = strFileName.Contains("-") ? strFileName.Replace("Logo [", "").Replace(strYear1 + "-", "").Substring(0, 4) : "";
                        if (strYear2 != "" && Convert.ToInt32(strReleaseYear) >= Convert.ToInt32(strYear1) && (Convert.ToInt32(strReleaseYear) <= Convert.ToInt32(strYear2) || strFileName.Contains(" Current")))
                        {
                            strLogoPath = file.Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/", "http://127.0.0.1:8887/").Replace("\\", "/");
                            
                        }
                        else if (Convert.ToInt32(strReleaseYear) == Convert.ToInt32(strYear1))
                        {
                            strLogoPath = file.Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/", "http://127.0.0.1:8887/").Replace("\\", "/"); 
                        }
                    }
                }

                iconBand.Src = strIconPath;
                logoBand.Src = strLogoPath;
                if (strReleaseLogo != "")
                {
                    LogoSpan.Style["display"] = "none";
                    logoTop.Src = strReleaseLogo.Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/", "http://127.0.0.1:8887/");
                    logoTop.Style["max-width"] = "100%";
                    logoTop.Style["height"] = "30px";
                }
                else if (strMediaType == "playlist")
                {
                    LogoSpan.Style["display"] = "none";
                    logoTop.Src = "/Images/Logos/" + strCurReleaseName.Replace("01.01.1000. ", "") + ".png";
                    logoTop.Style["max-width"] = "100%";
                    logoTop.Style["height"] = "30px";
                }
                else
                {
                    logoTop.Style["display"] = "none";
                    LogoSpan.Style["display"] = "block";
                    if (strCurrentReleaseDir == "" || strReleaseName == "Promo Material")
                    {
                        LogoSpan.InnerText = strExtraArtist != "" ? strCurrentUrlItem.Replace(" [By ", "").Replace(strExtraArtist, "").Replace("]", "") : strReleaseName;
                    }
                    else
                    {
                        LogoSpan.InnerText = strExtraArtist != "" ? strCurrentUrlItem.Replace(" [By ", "").Replace(strExtraArtist, "").Replace("]", "") : strCurrentReleaseDir;
                    }
                }
            }

            if (Session["curArtistCode"].ToString() == "0")
            {
                divArtistLogos.Style["display"] = "none";
                divContainerAlbumData.Style["margin-top"] = "50px";
                divRelNav.Style["margin-top"] = "-50px";
                logoTop.Style["display"] = "none";
                LogoSpan.Style["display"] = "block";
                LogoSpan.InnerText = strReleaseName;
                Session["systemPlaylist"] = "true";
            }

            lstPaths.Add("http://127.0.0.1:8887/" + HttpContext.Current.Session["curPageName"] + "/" + HttpContext.Current.Session["curArtistInitial"]?.ToString() + "/" + strEncodedNameBand + "/Gallery/Photos/");
            lstPaths.Add("http://127.0.0.1:8887/" + HttpContext.Current.Session["curPageName"] + "/" + HttpContext.Current.Session["curArtistInitial"]?.ToString() + "/" + strEncodedNameBand + "/Gallery/Logos/");
            //File names field population
            txtLogos.Value = String.Join(";", lstLogos.ToArray().Select(p => p.ToString()).ToArray());
            txtIcons.Value = String.Join(";", lstIcons.ToArray().Select(p => p.ToString()).ToArray());
            txtPosters.Value = strPosterPath;
            txtWalls.Value = strWallPath;
            //txtPaths.Value = String.Join(";", lstPaths.ToArray().Select(p => p.ToString()).ToArray());
            imgTitle.Value = HttpContext.Current.Session["curReleaseName"].ToString();
            string strItemType = HttpContext.Current.Session["curPath"].ToString().Contains("Singles") ? "song" : "album";
            string strSeparator = strRelType == "Extended Play" || strRelType == "Album" ? "an " : "a ";
            CultureInfo prov = CultureInfo.InvariantCulture;
            string strDat = HttpContext.Current.Session["curReleaseName"].ToString().Substring(0, 11);
            string strFormdDate = strDat.Remove(strDat.Length - 1).Replace(".", "-");
            DateTime dtDat = strMediaType == "playlist" ? DateTime.Now : DateTime.ParseExact(strFormdDate, new string[] { "yyyy.MM.dd", "yyyy-MM-dd" }, prov, DateTimeStyles.None);
            strFormdDate = strMediaType == "playlist" ? "" : dtDat.ToString("MMMM dd, yyyy");
            string strSingleOrigin = strItemType == "song" && strInnerDirectory != "" && !isStandalone ? ", taken from their album " + strInnerDirectory.Substring(12) + " released in " + strInnerDirectory.Substring(0, 4) + "." : ".";
            strReleaseYear = strItemType == "song" && strInnerDirectory != "" ? strInnerDirectory.Substring(0, 4) : strReleaseYear;
            //Remove bracket contents (like [Box Set])
            if (strReleaseName.Contains(" ["))
            {
                int start = strReleaseName.LastIndexOf(" [") + " [".Length;
                int end = strReleaseName.IndexOf("]", start);
                strReleaseName = strReleaseName.Remove(start, end - start).Replace(" []", "");
            }

            //Get Data from Wikipedia
            string strWikiAbout = "";
            DataTable dtReleaseData = new DataTable();
            if (strMediaType != "playlist")
            { 
                string strMBID = dtBand.Rows[0][2].ToString();
                string strArtistID = dtBand.Rows[0][0].ToString();
                string strReleaseToSearch = HttpContext.Current.Session["curReleaseName"].ToString().Substring(0, 11);
                if (strPosterPath.Contains("Promo Material") && strPromoRelease == "Promo Material")
                {
                    strReleaseToSearch = Path.GetFileNameWithoutExtension(strPosterPath);
                    dtReleaseData = ExtServices.GetRecordByThreeValues("releases", "relTitle", strReleaseToSearch.Substring(12).Replace("'", "▀").Replace(",", "■"), "relFKBands", strArtistID, "relDate", strReleaseToSearch.Substring(0, 11), "relDate", "ASC");

                }
                else
                {
                    dtReleaseData = ExtServices.GetRecordByThreeValues("releases", "relTitle", HttpContext.Current.Session["curReleaseName"].ToString().Substring(12).Replace("'", "▀").Replace(",", "■"), "relFKBands", strArtistID, "relDate", strReleaseToSearch, "relDate", "ASC");
                }
                string strWikiAboutDT = dtReleaseData?.Rows[0][7].ToString();
                strWikiAbout = strReleaseName != "" && strWikiAboutDT == "" ? Wikipedia("about", strReleaseName.Replace(" By ", " by ").Replace(" For ", " for ")) : strWikiAboutDT != "" ? strWikiAboutDT : "";

                if (dtReleaseData != null && strExtraArtist == "")
                {
                    strWikiAbout = strWikiAbout == "" || strWikiAbout.Length < 60 || strWikiAbout.Contains("may refer to:") || strWikiAbout.Contains("may also refer to:") ? Wikipedia("about", strReleaseName + " (" + strItemType + ")") : strWikiAbout;
                    strWikiAbout = strWikiAbout == "" || strWikiAbout.Length < 60 || strWikiAbout.Contains("may refer to:") || strWikiAbout.Contains("may also refer to:") ? Wikipedia("about", strReleaseName + " (" + strCurArtist + " " + strItemType + ")") : strWikiAbout;
                    strWikiAbout = strWikiAbout == "" || strWikiAbout.Length < 60 || strWikiAbout.Contains("may refer to: ") || strWikiAbout.Contains("may also refer to:") ? strReleaseName.Replace("%26","&") + " is " + strSeparator + strRelType.ToLower() + " by " + strCurArtist + " which came out on " + strFormdDate + strSingleOrigin : strWikiAbout;
                }
                else if (dtReleaseData != null)
                {
                    strWikiAbout = strWikiAbout == "" || strWikiAbout.Length < 60 || strWikiAbout.Contains("may refer to:") || strWikiAbout.Contains("may also refer to:") ? Wikipedia("about", strReleaseName.Replace(" [By ", "").Replace(strExtraArtist, "").Replace("]", "") + " (" + strItemType + ")") : strWikiAbout;
                    strWikiAbout = strWikiAbout == "" || strWikiAbout.Length < 60 || strWikiAbout.Contains("may refer to:") || strWikiAbout.Contains("may also refer to:") ? Wikipedia("about", strReleaseName.Replace(" [By ", "").Replace(strExtraArtist, "").Replace("]", "") + " (" + strCurArtist + " " + strItemType + ")") : strWikiAbout;
                    strWikiAbout = strWikiAbout == "" || strWikiAbout.Length < 60 || strWikiAbout.Contains("may refer to:") || strWikiAbout.Contains("may also refer to:") ? strReleaseName.Replace(" [By ", "").Replace(strExtraArtist, "").Replace("]", "") + " is " + strSeparator + strRelType.ToLower() + " by " + strCurArtist + " which came out on " + strFormdDate + strSingleOrigin : strWikiAbout;
                }

                string strProducer = "";
                if (strWikiAbout != "" && (dtReleaseData == null || dtReleaseData.Rows.Count == 0))
                {
                    strInnerDirectory = strInnerDirectory != "" ? strInnerDirectory.Substring(12) : strInnerDirectory;
                    aboutTextBox.Text = strWikiAbout?.Replace("\n", "\n\n");
                    if (strWikiAboutDT == "" && dtReleaseData != null)
                    {
                        if (dtReleaseData == null && strReleasePath.Contains("/Video/"))
                        {
                            strWikiAbout = strReleaseName + " is a video compilation by " + strCurArtist + ", which features videos across the entire artist's history.";
                        }
                        ExtServices.UpdateSingleFieldByID("releases", strWikiAbout.Replace("\"", "").Replace("'", ""), "relFKdesc", "relID", Convert.ToInt32(dtReleaseData.Rows[0][0].ToString()));
                    }
                    if (strWikiAbout != null && strWikiAbout != "" && strWikiAbout.ToLower().Contains("produce"))
                    {
                        string strProdSeparator = strWikiAbout.ToLower().Contains("was produced by ") ? "was produced by " : strWikiAbout.ToLower().Contains("producer") ? "producer" : "produce";
                        int pFrom = strWikiAbout.ToLower().IndexOf(strProdSeparator) + strProdSeparator.Length;
                        strProducer = strWikiAbout.Substring(pFrom);
                        string strDescSeparator = strProducer.Contains(",") ? "," : ".";
                        int pTo = strProducer.ToLower().IndexOf(strDescSeparator);
                        strProducer = strProducer.Substring(0, pTo).Replace("'", "\'").Replace(" and ", "⠀• ").Replace(", ", "/");
                        if (strProducer.Substring(0, 2) == "s ")
                        {
                            strProducer = strProducer.Substring(2);
                        }
                        else if (strProducer.Substring(0, 1) == " ")
                        {
                            strProducer = strProducer.Substring(1);
                        }

                        if (strProducer.Contains("."))
                        {
                            strProducer = strProducer.Substring(0, strProducer.IndexOf("."));
                        }

                        if (strProducer.Contains("d by "))
                        {
                            strProducer = strProducer.Replace("d by ", "");
                        }

                        txtProducer.Value = strProducer;

                        string[] strProducerList = strProducer.Replace("⠀• ", ";").Replace(",", ";").Split(';');

                        foreach (string prodName in strProducerList)
                        {
                            //Look for producer in artists
                            DataTable dtProducer = ExtServices.GetRecordByValue("artists", "artStageName", prodName);
                            string strGlobProducer = "";

                            if (dtProducer != null && dtProducer.Rows.Count > 0)
                            {
                                //Check if it has a value of 1 for artFKoccupations, if not, then update
                                if (!dtProducer.Rows[0][14].ToString().Contains("1"))
                                {
                                    string strOccupationValue = dtProducer.Rows[0][14].ToString() == "" ? "1" : dtProducer.Rows[0][14].ToString() + ";1";
                                    ExtServices.UpdateSingleFieldByID("artists", strOccupationValue, "artFKoccupations", "artID", Convert.ToInt32(dtProducer.Rows[0][0].ToString()));
                                }

                                strGlobProducer = prodName;
                            }

                            else
                            {
                                //Look for it on MB, register it
                                MusicBrainzClient client = new MusicBrainzClient();
                                Task<string> taskId = Task.Run(() => PrimaryPage.GetItemId(client, prodName));
                                taskId.Wait();
                                string strArtCode = taskId.Result;

                                if (strArtCode != "")
                                {
                                    MusicBrainzClient client2 = new MusicBrainzClient();
                                    Task<Artist> tsArtist = Task.Run(() => PrimaryPage.ValidateItemId(client2, strArtCode, "artist"));
                                    tsArtist.Wait();
                                    if (tsArtist.Result != null)
                                    {
                                        List<string> lstCol = new List<string>();
                                        List<string> lstVal = new List<string>();

                                        lstCol.Add("artCode");
                                        lstCol.Add("artName");
                                        lstCol.Add("artStageName");
                                        lstCol.Add("artAliases");
                                        lstCol.Add("artFKoccupations");

                                        string strAliases = "";
                                        string strLegalName = "";
                                        if (tsArtist.Result.Aliases != null)
                                        {
                                            foreach (var alias in tsArtist.Result.Aliases)
                                            {
                                                if (alias.Type == "Legal name")
                                                {
                                                    strLegalName = alias.Name.ToString(); //Name
                                                }
                                                else
                                                {
                                                    strAliases = alias.Name.ToString() == "" ? strAliases : strAliases + ";" + alias.Name.ToString();
                                                }
                                            }
                                        }

                                        strLegalName = strLegalName != "" ? strLegalName : tsArtist.Result.Name;

                                        lstVal.Add(strArtCode);
                                        lstVal.Add(strLegalName);
                                        lstVal.Add(prodName);
                                        lstVal.Add(strAliases);
                                        lstVal.Add("1");

                                        ExtServices.InsertByTableName("artists", lstCol, lstVal);
                                        strGlobProducer = prodName;
                                    }
                                }
                            }
                        }
                    }
                }

                //If release exists
                else
                {
                    aboutTextBox.Text = strWikiAbout?.Replace("\n", "\n\n");
                    if (strWikiAboutDT == "")
                    {
                        if (strReleasePath.Contains("/Video/"))
                        {
                            strWikiAbout = strReleaseName + " is a video compilation by " + strCurArtist + ", which features videos across the entire artist's history.";
                        }
                        ExtServices.UpdateSingleFieldByID("releases", strWikiAbout.Replace("\"", "").Replace("'", ""), "relFKdesc", "relID", Convert.ToInt32(dtReleaseData.Rows[0][0].ToString()));
                    }
                    HttpContext.Current.Session["curReleaseID"] = dtReleaseData.Rows[0][0].ToString();
                    string strCurProducer = dtReleaseData != null && dtReleaseData.Rows.Count > 0 ? dtReleaseData.Rows[0][10].ToString() : "";
                    string strCurLabel = dtReleaseData != null && dtReleaseData.Rows.Count > 0 ? dtReleaseData.Rows[0][5].ToString() : "";
                    string strCurGenres = dtReleaseData != null && dtReleaseData.Rows.Count > 0 ? dtReleaseData.Rows[0][6].ToString().Replace(";", "⠀•⠀") : "";
                    string strReleaseCode = "";
                    string strProducerNames = "";

                    if ((strCurProducer != "" && strCurLabel != "" && strCurGenres != ""))
                    {
                        string strHTMLProd = "";
                        string strEditField = "<input runat='server' id='field_id' value='editVal' type='text' class='form-control relEditField' placeholder='Hit enter to save changes' style='width: 60%;display: none;margin: 0 auto;margin-bottom:2px'/>";//display:table

                        //Release code
                        strReleaseCode = strReleaseCode == "" && dtReleaseData != null && dtReleaseData.Rows.Count > 0 && dtReleaseData.Rows[0][12].ToString() != "" ? dtReleaseData.Rows[0][12].ToString() : strReleaseCode;
                        //Retrieve producer name from artists table
                        foreach (string prodName in strCurProducer.Split(';'))
                        {
                            string strCurrentProdName = prodName.Replace("_bnd", "");
                            DataTable dtArtistName = new DataTable();

                            if (!prodName.Contains("_bnd"))
                            {
                                dtArtistName = strCurLabel != "Self-released record" || (prodName.All(char.IsDigit) && prodName != HttpContext.Current.Session["curArtistID"].ToString()) ? ExtServices.GetRecordByValue("artists", "artID", prodName) : ExtServices.GetRecordByValue("bands", "bndID", prodName);
                            }
                            else
                            {
                                dtArtistName = strCurLabel != "Self-released record" || (prodName.All(char.IsDigit) && strCurrentProdName != HttpContext.Current.Session["curArtistID"].ToString()) ? ExtServices.GetRecordByValue("bands", "bndID", strCurrentProdName) : ExtServices.GetRecordByValue("bands", "bndID", strCurrentProdName);
                            }
                            int intIndex = prodName.Contains("_bnd") ? 1 : 3;

                            string prodName2 = dtArtistName != null && dtArtistName.Rows.Count > 0 && strCurLabel != "Self-released record" ? dtArtistName.Rows[0][intIndex].ToString() : dtArtistName != null && dtArtistName.Rows.Count > 0 && strCurLabel == "Self-released record" || (prodName.All(char.IsDigit) && prodName != HttpContext.Current.Session["curArtistID"].ToString()) ? dtArtistName.Rows[0][intIndex].ToString() : dtArtistName.Rows[0][1].ToString();
                            string strURL = "https://en.wikipedia.org/wiki/" + prodName2;

                            string strSeparatorArt = ", ";

                            if ((prodName == strCurProducer.Split(';').Last()) || strCurProducer.Split(';').Length - 1 == 1)
                            {
                                strSeparatorArt = " and ";
                            }

                            try
                            {
                                HttpWebRequest request = WebRequest.Create(strURL) as HttpWebRequest;
                                request.Method = "HEAD";
                                HttpWebResponse response = request.GetResponse() as HttpWebResponse;
                                response.Close();
                            }
                            catch
                            {
                                strURL = "https://www.google.com/search?q=" + prodName2.Replace(" ", "+") + "+producer";
                            }

                            strHTMLProd = strHTMLProd == "" ? "<p class='pSpaAlbumEdit'  style='display: table;margin: 0 auto;margin-bottom:2px'><a class='pEditAttr aSpaAlbum pSpaLabel' style='text-decoration: none; padding-right: 6px;'>Produced  by </a>" + "<a href='" + strURL + "' target='_blank' class='anchorProd coloredText' style='font-weight:bold;text-decoration:none; cursor:pointer'>" + prodName2 + "</a>" : strHTMLProd + "<a href='javascript:void(0)' class='pEditAttr aSpaAlbum pSpaLabel' style='text-decoration:none;padding-left:6px;padding-right:6px; color:inherit'>" + strSeparatorArt + "</a>" +
                                        "<a href='" + strURL + "' target='_blank' class='anchorProd coloredText' style='font-weight:bold; text-decoration:none;cursor:pointer'>" + prodName2 + "</a>";

                            strProducerNames = strProducerNames == "" ? prodName2 : strProducerNames + "; " + prodName2;
                        }

                        string strRelGenres = "<br><p class='pEditAttr pSpaAlbumEdit'  style='display: table;margin: 0 auto;margin-bottom:18px'><a class='aSpaAlbum pSpaGenre' style='text-decoration: none'>" + strCurGenres + "</a></p>";
                        spaGen.InnerHtml = strRelGenres + strEditField.Replace("editVal", strCurGenres.Replace("⠀•⠀", ";")).Replace("field_id", "fieldRelGenres");

                        string strRelLabel = strCurLabel != "Self-released record" ? "<p class='pEditAttr pSpaAlbumEdit' style='display: table;margin: 0 auto;margin-top:5px'><a class='aSpaAlbum pSpaLabel' style='text-decoration: none'>Distributed by " + strCurLabel + "</a></p>" : "<p class='pEditAttr pSpaAlbumEdit'  style='display: table;margin: 0 auto;margin-top:5px'><a class='aSpaAlbum pSpaLabel' style='text-decoration: none'>" + strCurLabel + "</a></p>";
                        spaLabel.InnerHtml = strRelLabel + strEditField.Replace("editVal", strCurLabel).Replace("field_id", "fieldRelLabel");
                        imgLabel.Src = System.IO.File.Exists(HttpContext.Current.Server.MapPath("~/Images/Companies/") + strCurLabel + ".png") ? "/Images/Companies/" + strCurLabel + ".png" : "/Images/Companies/Self-released record.png";
                        imgLabel.Style.Add("display", "table");
                        spaProd.InnerHtml = strHTMLProd + "</p>" + strEditField.Replace("editVal", strProducerNames).Replace("field_id", "fieldRelProducer");

                        txtRelGenres.Value = strCurGenres.Replace("⠀•⠀", ";");
                        txtRelProducers.Value = strProducerNames;
                        txtRelLabel.Value = strCurLabel;
                    }
                }
                //Lineup on the release
                string strParticipations = dtReleaseData?.Rows[0][11].ToString()?.Replace("■",",");
                string strRelInstruments = dtReleaseData?.Rows[0][8].ToString();
                //Get Members that participated on the release if lineup field is empty
                if (strParticipations == null || strRelInstruments == null || strParticipations == "" || strRelInstruments == "")
                {
                    DataTable dtParticipations = ExtServices.GetRecordByValue("artistparticipations", "arpFKbands", strArtistID);
                    if (dtParticipations != null && dtParticipations.Rows.Count > 0)
                    {
                        for (int i = 0; i < dtParticipations.Rows.Count; i++)
                        {
                            //If start date is not null
                            if (dtParticipations.Rows[i][3].ToString() != "")
                            {
                                string[] strStartArray = dtParticipations.Rows[i][3].ToString().Split(';');
                                string strEndDate = dtParticipations.Rows[i][4].ToString() == "" ? DateTime.Now.Year.ToString() : dtParticipations.Rows[i][4].ToString();
                                // If End date has 1 or more than 1 periods
                                if (strEndDate != "")
                                {
                                    string[] strEndArray = strEndDate.Split(';');

                                    if (strStartArray.Length > strEndArray.Length)
                                    {
                                        strEndArray = strEndArray.Concat(new string[] { DateTime.Now.Year.ToString() }).ToArray();
                                    }

                                    for (int j = 0; j < strStartArray.Length; j++)
                                    {
                                        if (Convert.ToInt32(strStartArray[j].Substring(0, 4)) <= Convert.ToInt32(strReleaseYear) && Convert.ToInt32(strEndArray[j].Substring(0, 4)) >= Convert.ToInt32(strReleaseYear))
                                        {
                                            strParticipations = strParticipations == "" ? dtParticipations.Rows[i][2].ToString() : strParticipations + "," + dtParticipations.Rows[i][2].ToString();

                                            //Get Instruments
                                            string strInstrumentList = dtParticipations.Rows[i][6].ToString().Replace(";", ",");
                                            DataTable dtInstruments = ExtServices.GetRecordByValueList("instruments", "insID", strInstrumentList, "insID", "DESC");
                                            string strInstrumentNames = "";
                                            if (dtInstruments != null && dtInstruments.Rows.Count > 0)
                                            {
                                                for (int k = 0; k < dtInstruments.Rows.Count; k++)
                                                {
                                                    strInstrumentNames = strInstrumentNames == "" ? dtInstruments.Rows[k][1].ToString() : strInstrumentNames + "⠀•⠀" + dtInstruments.Rows[k][1].ToString();

                                                }
                                                dtParticipations.Rows[i][6] = strInstrumentNames;
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        //Filter rows of participation table
                        for (int i = 0; i < dtParticipations.Rows.Count; i++)
                        {
                            var mwd = dtParticipations.Rows[i][6].ToString();
                            int n;
                            bool valid = int.TryParse(mwd, out n);
                            if (valid || dtParticipations.Rows[i][6].ToString().Contains(";"))
                            {
                                dtParticipations.Rows[i].Delete();
                                i--;
                                dtParticipations.AcceptChanges();
                            }
                        }

                        // Get participations
                        if (strParticipations != "")
                        {
                            strRelInstruments = string.Join("~", dtParticipations.AsEnumerable().Select(row => row.Field<string>("artFKinstruments") ?? string.Empty));
                            List<string> lstCol = new List<string>();
                            List<string> lstVal = new List<string>();
                            lstCol.Add("relFKlineup");
                            lstCol.Add("relFKinstruments");
                            lstVal.Add(strParticipations);
                            lstVal.Add(strRelInstruments);
                            try
                            {
                                ExtServices.UpdateByRecordID("releases", lstCol, lstVal, "relID", Convert.ToInt32(dtReleaseData.Rows[0][0].ToString()));
                            }
                            catch (Exception)
                            {

                                throw;
                            }
                        }
                    }
                }

                DataTable dtArtists = ExtServices.GetRecordByValueList("artists", "artID", strParticipations, "artID");
                string strPersonnelText = "";
                if (dtArtists != null && dtArtists.Rows.Count > 0)
                {                    
                    string strPersonnel = "<div runat='server' id='divPersonnelContent' style='width:100%; padding:10px;display: flex;justify-content: center'>";

                    for (int i = 0; i < dtArtists.Rows.Count; i++)
                    {
                        string strImageURL = "/Images/System/" + "poster_H.jpg";
                        char charCurInitial = dtArtists.Rows[i][3].ToString().ToUpper()[0];
                        charCurInitial = Char.IsDigit(charCurInitial) ? '#' : Char.IsSymbol(charCurInitial) ? '' : charCurInitial;
                        if (System.IO.File.Exists(HttpContext.Current.Server.MapPath("~/Images/Artists/" + charCurInitial + "/") + dtArtists.Rows[i][3].ToString() + " (" + dtArtists.Rows[i][1].ToString() + ").jpg"))
                        {
                            strImageURL = "/Images/Artists/" + charCurInitial + "/" + Uri.EscapeDataString(dtArtists.Rows[i][3].ToString() + " (" + dtArtists.Rows[i][1].ToString() + ").jpg");
                        }

                        strPersonnel = strPersonnel + "<div id='personnelContainer" + i + "' style='display: inline-block;width:" + 100 / dtArtists.Rows.Count + "%'><div id= 'artistDiv" + i + "' class= 'divContentItem" + i + " divArtistPhoto' data-id='" + dtArtists.Rows[i][0] + "' data-name='" + dtArtists.Rows[i][2] + "' data-code='" + dtArtists.Rows[i][1] + "'" +
                            " title='" + dtArtists.Rows[i][2].ToString() + "' style='background-image:url(" + strImageURL +
                            "); background-size:cover; background-position:center top;max-width: 70px;min-height: 70px;border-radius: 50%;margin: 0 auto'></div><div class='spanArtistContainer' style='margin-top:15px'>"
                            + "<span href='javascript:void(0)' id = 'PersonnelSpan" + i + "' class = 'artistRef coloredText divContentSpan' data-name='" + dtArtists.Rows[i][3].ToString().Replace(";", ",") + "' style='font-weight:600;text-align: center;font-size:10px;margin: 0 auto;display: table;margin-top:-5px;text-decoration:none;cursor:pointer'>" + dtArtists.Rows[i][3].ToString() + "</span><br>"
                            + "<span class = 'divContentSpan' style='text-align: center;font-size:10px;margin: 0 auto;display: table;margin-top:-20px;'> " + strRelInstruments.Split('~')[i].Replace(";", ",") + "</span></div></div>";

                        strPersonnelText = strPersonnelText == "" ? dtArtists.Rows[i][3].ToString() + " on " + strRelInstruments.Split('~')[i].Replace("⠀•⠀", " and ") : strPersonnelText + ", " + dtArtists.Rows[i][3].ToString() + " on " + strRelInstruments.Split('~')[i].ToLower().Replace("⠀•⠀", " and ");
                    }

                    strPersonnel = strPersonnel + "</div>";
                    //ADD strPersonnel
                    divPersonnel.InnerHtml = strPersonnel;
                    if (aboutTextBox.Text.Contains("which came out on"))
                    {
                        // Remove last occurrence of , and insert another separator
                        if (strParticipations.Count(c => c == ',') > 1)
                        {
                            int place = strPersonnelText.LastIndexOf(", ");
                            strPersonnelText = strPersonnelText.Remove(place, ", ".Length).Insert(place, " and ");
                            aboutTextBox.Text = aboutTextBox.Text + " The record counts with the following participations: " + strPersonnelText + ".";
                        }
                        else
                        {
                            strPersonnelText = strPersonnelText.Replace(" and ", ", ");
                            int place = strPersonnelText.LastIndexOf(", ");
                            strPersonnelText = strPersonnelText.Remove(place, ", ".Length).Insert(place, " and ");
                            aboutTextBox.Text = aboutTextBox.Text + " The record counts with the participation of " + strPersonnelText + ".";
                        }
                    }
                }

                //Singles in the release
                if (!Session["curPath"].ToString().Contains("\\Singles") && Session["curPath"].ToString() != "Singles" && Directory.Exists(strReleasePath.Replace(HttpContext.Current.Session["curPath"].ToString(), "Singles")))
                {
                    string strSinglesPath = strReleasePath.Replace(HttpContext.Current.Session["curPath"].ToString(), "Singles");
                    string strSinglePaths = "";
                    string[] strDirectories = Directory.GetDirectories(strSinglesPath);
                    Array.Sort(strDirectories);
                    string strSingles = "<div runat='server' id='divPersonnelContent' style='width:100%;padding-top:10px;margin-bottom:-10px; display: flex;justify-content: center'>";
                    foreach (string directory in strDirectories)
                    {
                        string strDirName = new DirectoryInfo(directory).Name.ToString();
                        string strYear = strDirName.Substring(0, 4);
                        CultureInfo provider = CultureInfo.InvariantCulture;
                        string strDate = strDirName.Substring(0, 11);
                        string strFormattedDate = strDate.Remove(strDate.Length - 1).Replace(".", "-");
                        DateTime dtDate = DateTime.ParseExact(strFormattedDate, new string[] { "yyyy.MM.dd", "yyyy-MM-dd" }, provider, DateTimeStyles.None);
                        strFormattedDate = dtDate.ToString("MMM dd, yyyy");
                        strDirName = strDirName.Substring(12).Replace("'", "\'");
                        int intCountSingle = 0;

                        string strCoverPath = "";

                        string[] strSubDirectory = Directory.GetDirectories(directory);
                        Array.Sort(strSubDirectory);

                        foreach (string subdirectory in strSubDirectory)
                        {
                            if (subdirectory.Contains("Standard Edition"))
                            {
                                strSinglePaths = strSinglePaths == "" ? subdirectory : strSinglePaths + ";" + subdirectory;
                                strCoverPath = System.IO.File.Exists(subdirectory + "/[Artwork]/Cover - Front.jpg") ? subdirectory + "/[Artwork]/Cover - Front.jpg" : System.IO.File.Exists(subdirectory + "/[Artwork]/Cover - Front.png") ? subdirectory + "/[Artwork]/Cover - Front.png" : "/Images/System/poster_V.jpg";
                                break;
                            }
                            else if (subdirectory.Contains("[Artwork]"))
                            {
                                strSinglePaths = strSinglePaths == "" ? subdirectory : strSinglePaths + ";" + subdirectory;
                                strCoverPath = System.IO.File.Exists(subdirectory + "/Cover - Front.jpg") ? subdirectory + "/Cover - Front.jpg" : System.IO.File.Exists(subdirectory + "/Cover - Front.png") ? subdirectory + "Cover - Front.png" : "/Images/System/poster_V.jpg";
                                break;
                            }

                        }
                        strCoverPath = strCoverPath != "" ? strCoverPath.Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/", "http://127.0.0.1:8887/").Replace("\\", "/").Replace("'", "%27") : "";
                        strSingles = strSingles + "<div id='singleContainer" + intCountSingle + "' class='aAlbumPage' style='display: inline-block;width:" + 100 / strDirectories.Length + "%; cursor:pointer' data-value='" + strDirName + "' title='" + strDirName + " (" + strYear + ")'>"
                            + "<img runat='server' id='imgSingle" + intCountSingle + "' class='imgSingle' src='" + strCoverPath + "' style='display: table; margin: 0 auto; margin - top: 5px; height: 60px; max-width:100%'/>"
                            + "<span id = 'SingleSpan" + intCountSingle + "' class = 'divSubContentSpan' data-name='" + strDirName.Replace(";", ",") + "' style='text-align: center;font-size:10px;margin: 0 auto;display: table;margin-top:2px'>"
                            + "<p class='aSpaAlbum aAlbumPage coloredText isSingleBox'  data-value='" + strDirName + "' style='text-decoration: none; font-weight:bold;cursor:pointer'>" + strDirName + "</p><p style='margin-top:-20px'>" + strFormattedDate + "<p></span></div>";
                        intCountSingle++;
                    }

                    strSingles = strSingles + "</div>";
                    //ADD strPersonnel
                    divSingles.InnerHtml = strSingles;
                    divSingles.Attributes.Add("style", "display:block");
                    txtSinglesPath.Value = strSinglePaths.Replace("'", "%27");
                }

                //Image
                string strReleasePic = strInnerDirectory != "" ? strInnerDirectoryWithDate : strCurReleaseName;
                string[] strCurFolderFiles = Directory.GetFiles(HttpContext.Current.Session["currentDisk"].ToString() + "/" + HttpContext.Current.Session["curPageName"] + "/" + HttpContext.Current.Session["curArtistInitial"]?.ToString() + "/" + strCurArtist + "/Gallery/Photos");
                Array.Sort(strCurFolderFiles);
                string strImagePath = HttpContext.Current.Session["currentDisk"].ToString() + "/" + HttpContext.Current.Session["curPageName"] + "/" + HttpContext.Current.Session["curArtistInitial"]?.ToString() + "/" + strCurArtist + "/Gallery/Photos/" + strReleasePic.Substring(0, 4) + ".00. " + strReleasePic.Substring(11).Replace("'", "%27") + " Era_H.jpg";
                int intPicYear = 0;
                if (!System.IO.File.Exists(strImagePath))
                {
                    string[] strTempCurFolderFiles = strCurFolderFiles.Where(val => val.Contains(strReleasePic.Substring(0, 4)) && val.Contains("_H.jpg")).ToArray();
                    intPicYear = Convert.ToInt32(strReleasePic.Substring(0, 4));
                    if (strTempCurFolderFiles.Count() == 0)
                    {
                        for (int i = intPicYear; i > 0; i--)
                        {
                            strTempCurFolderFiles = strCurFolderFiles.Where(val => val.Contains((i - 1).ToString()) && val.Contains("_H.jpg")).ToArray();
                            if (strTempCurFolderFiles.Count() > 0)
                            {
                                intPicYear = i - 1;
                                break;
                            }
                        }
                    }
                    strCurFolderFiles = strTempCurFolderFiles;
                    strImagePath = strCurFolderFiles.Count() > 0 ? strCurFolderFiles[0].Replace("\\", "/") : strImagePath;
                }

                //Pending to verify if such scenario can exist
                if (strCurFolderFiles.Count() == 0)
                {
                    for (int i = Convert.ToInt32(strReleasePic.Substring(0, 4)); i > 0; i--)
                    {
                        if (!System.IO.File.Exists(strImagePath))
                        {
                            strImagePath = strImagePath.Replace(i + "_H.jpg", i - 1 + "_H.jpg");
                        }
                        else
                        {
                            intPicYear = i;
                            break;
                        }
                    }

                    if (intPicYear == 0)
                    {
                        string strPhotosPath = strImagePath.Split(']')[0] + ']';
                        string strPhotoYear = strImagePath.Split(']')[1].Substring(1, 4);
                        string[] strGetPhotos = Directory.GetFiles(HttpContext.Current.Session["currentDisk"].ToString() + "/" + HttpContext.Current.Session["curPageName"] + "/" + HttpContext.Current.Session["curArtistInitial"]?.ToString() + "/" + strCurArtist + "/Gallery/Photos");
                        Array.Sort(strGetPhotos);
                        foreach (string photo in strGetPhotos)
                        {
                            string strCurrentPhotoYear = Path.GetFileNameWithoutExtension(photo).Substring(0, 4);
                            if (Convert.ToInt32(strCurrentPhotoYear) <= Convert.ToInt32(strPhotoYear) && !strImagePath.Contains(strCurrentPhotoYear))
                            {
                                strImagePath = photo;
                            }
                            else
                            {
                                break;
                            }
                        }
                    }
                }

                strImagePath = System.IO.File.Exists(strImagePath) ? strImagePath.Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/", "http://127.0.0.1:8887/").Replace("\\", "/").Replace("'", "%27") : strImagePath.Replace("_H.jpg", "_" + strReleasePic.Substring(12) + "_H.jpg").Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/", "http://127.0.0.1:8887/").Replace("\\", "/").Replace("'", "%27");
                string strImagePathLocal = strImagePath.Replace("http://127.0.0.1:8887/", HttpContext.Current.Session["currentDisk"].ToString() + "/").Replace("/", "\\").Replace("%27", "'");
                //Verify if photocards exist
                // 1. Define the base directory for artwork
                string directoryPath = Path.GetDirectoryName(strPosterPath);
                string artworkPath = directoryPath;

                // 2. Initialize holding strings for both card HTML blocks
                string verticalCardHtml = string.Empty;
                string horizontalCardHtml = string.Empty;
                string horizontalWallHtml = string.Empty;
                string verticalWallHtml = string.Empty;

                if (Directory.Exists(artworkPath))
                {
                    // Search only within the [Artwork] subdirectory
                    var allPhotocards = Directory.GetFiles(artworkPath, "*Photocard*", SearchOption.TopDirectoryOnly);
                    var allWallpapers = Directory.GetFiles(artworkPath, "*Wallpaper*", SearchOption.TopDirectoryOnly);

                    // Filter and pick files for Vertical (Portrait) Card
                    string vFrontFile = allPhotocards.FirstOrDefault(f => f.Contains("Portrait") && f.Contains("Front"));
                    string vBackFile = allPhotocards.FirstOrDefault(f => f.Contains("Portrait") && f.Contains("Back"));

                    // Filter and pick files for Horizontal (Landscape) Card
                    string hFrontFile = allPhotocards.FirstOrDefault(f => f.Contains("Landscape") && f.Contains("Front"));
                    string hBackFile = allPhotocards.FirstOrDefault(f => f.Contains("Landscape") && f.Contains("Back"));

                    string vWallpaper = allWallpapers.FirstOrDefault(f => f.Contains("Portrait"));
                    string hWallpaper = allWallpapers.FirstOrDefault(f => f.Contains("Landscape"));

                    // Generate HTML for Vertical Card if both sides exist
                    if (vFrontFile != null && vBackFile != null)
                    {
                        string vFrontUrl = vFrontFile.Replace("\\", "/").Replace("S:/", "http://127.0.0.1:8887/");
                        string vBackUrl = vBackFile.Replace("\\", "/").Replace("S:/", "http://127.0.0.1:8887/");

                        // Keep original style like 'height: 235px' to match existing layout
                        verticalCardHtml = $@"
                        <div class='flip-card column v-card' onclick='this.classList.toggle(""is-flipped"")' style='height: 235px; margin-top: 5px; max-width:100%;'>
                            <div class='flip-card-inner'>
                                <div class='flip-front'>
                                    <img src='{vFrontUrl}' style='height: 235px; width: 100%; object-fit: contain; border-radius: 8px;'>
                                </div>
                                <div class='flip-back'>
                                    <img src='{vBackUrl}' style='height: 235px; width: 100%; object-fit: contain; border-radius: 8px;'>
                                </div>
                            </div>
                        </div>";
                    }

                    // Generate HTML for Horizontal Card if both sides exist
                    if (hFrontFile != null && hBackFile != null)
                    {
                        string hFrontUrl = hFrontFile.Replace("\\", "/").Replace("S:/", "http://127.0.0.1:8887/");
                        string hBackUrl = hBackFile.Replace("\\", "/").Replace("S:/", "http://127.0.0.1:8887/");

                        // Keep original style 'height: 235px'
                        horizontalCardHtml = $@"
                        <div class='flip-card column h-card' onclick='this.classList.toggle(""is-flipped"")' style='height: 235px; margin-top: 5px; max-width:100%;'>
                            <div class='flip-card-inner'>
                                <div class='flip-front'>
                                    <img src='{hFrontUrl}' style='height: 235px; width: 100%; object-fit: contain; border-radius: 8px;'>
                                </div>
                                <div class='flip-back'>
                                    <img src='{hBackUrl}' style='height: 235px; width: 100%; object-fit: contain; border-radius: 8px;'>
                                </div>
                            </div>
                        </div>";
                    }

                    // Generate HTML for Vertical Wallpaper if exists
                    if (vWallpaper != null)
                    {
                        string vWallUrl = vWallpaper.Replace("\\", "/").Replace("S:/", "http://127.0.0.1:8887/");

                        // Keep original style like 'height: 235px' to match existing layout
                        verticalWallHtml = $@"
                        <div class='flip-card column v-card' onclick='this.classList.toggle(""is-flipped"")' style='height: 235px; margin-top: 5px; max-width:100%;'>
                            <div class='flip-card-inner'>
                                <div class='flip-front'>
                                    <img src='{strImagePath.Replace("_H.", "_V.")}' style='height: 235px; width: 100%; object-fit: contain; border-radius: 8px;'>
                                </div>
                                <div class='flip-back'>
                                    <img src='{vWallUrl}' style='height: 235px; width: 100%; object-fit: contain; border-radius: 8px;'>
                                </div>
                            </div>
                        </div>";
                    }

                    // Generate HTML for Vertical Wallpaper if exists
                    if (hWallpaper != null)
                    {
                        string hWallUrl = hWallpaper.Replace("\\", "/").Replace("S:/", "http://127.0.0.1:8887/");

                        // Keep original style like 'height: 235px' to match existing layout
                        horizontalWallHtml = $@"
                        <div class='flip-card column v-card' onclick='this.classList.toggle(""is-flipped"")' style='height: 235px; margin-top: 5px; max-width:100%;'>
                            <div class='flip-card-inner'>
                                <div class='flip-front'>
                                    <img src='{strImagePath}' style='height: 235px; width: 100%; object-fit: contain; border-radius: 8px;'>
                                </div>
                                <div class='flip-back'>
                                    <img src='{hWallUrl}' style='height: 235px; width: 100%; object-fit: contain; border-radius: 8px;'>
                                </div>
                            </div>
                        </div>";
                    }
                }

                

                if (!string.IsNullOrEmpty(verticalCardHtml) && !string.IsNullOrEmpty(horizontalCardHtml))
                {
                    // Both photocard sets found: Merge them into the row div
                    divImage.InnerHtml = verticalCardHtml + horizontalCardHtml;
                }
                // 3. Conditional Rendering (Merge or Fallback) Wallpaper
                else if (!string.IsNullOrEmpty(verticalWallHtml) && !string.IsNullOrEmpty(horizontalWallHtml))
                {
                    // Both wallpaper sets found: Merge them into the row div
                    divImage.InnerHtml = verticalWallHtml + horizontalWallHtml;
                }
                else
                {
                    // Fallback logic: If even one photocard is missing, return to the original default view
                    divImage.InnerHtml = "<img runat='server' id='imgGroup' class='imgGroup column' src='" + strImagePath.Replace("_H.", "_V.") + "' style='display: table; margin: 0 auto; margin-top: 5px; height: 235px; max-width:100%'/><img runat='server' id='imgGroup2' class='imgGroup column' src='" + strImagePath + "' style='display: table; margin: 0 auto; margin-top: 5px; height: 235px; max-width:100%'/>";

                }
                divImage.Attributes.Add("title", strCurArtist + ", " + intPicYear);
                if (!System.IO.File.Exists(strImagePathLocal) || HttpContext.Current.Session["curArtistID"].ToString() == "120 " || HttpContext.Current.Session["curArtistID"].ToString() == "120")
                {
                    divImage.Attributes.Add("style", "display:none");
                }
                if (HttpContext.Current.Session["curArtistID"].ToString() == "120 " || HttpContext.Current.Session["curArtistID"].ToString() == "120")
                {
                    divPersonnel.Attributes.Add("style", "display:none");
                }
                //Fill tracklist
                divContainerTracks.InnerHtml = strContentTrack(strReleasePath, strItemType, strCurArtist, lstVideoLinks);
                
                //Get writing credits
                if (dtReleaseData != null && dtReleaseData.Rows.Count > 0)
                {
                    string strReleaseID = HttpContext.Current.Session["curReleaseID"].ToString();
                    //If field is not empty
                    if (dtReleaseData.Rows[0][13].ToString() != "")
                    {
                        txtWriters.Value = dtReleaseData.Rows[0][13].ToString();
                    }
                }
            }
        }

        /// <summary>
        /// Populate tracklist for playlists
        /// </summary>
        /// <param name="strPlaylistTracks">Tracks</param>
        /// <param name="strCurReleaseName">"01.01.1000. Playlist Name"</param>
        /// <param name="strUserPlaylist">true or false</param>
        /// <param name="strIsArtistPlaylist">It's artist playlist (1) or not ("")</param>
        /// <param name="strSkipContainer">Skip container of table (1) or not ("")</param>
        /// <returns></returns>
        [System.Web.Services.WebMethod]
        public static string GetPlaylistTracklist(string strPlaylistTracks, string strCurReleaseName = "", string strUserPlaylist = "", string strIsArtistPlaylist = "", string strSkipContainer = "")
        {
            string strContentTrack = "", strReleasePath = "";
            string strCurrentArtist = HttpContext.Current.Session["curArtistName"].ToString();
            string strCurArtist = strCurrentArtist;
            bool isArtistPlaylist = strIsArtistPlaylist == "1" ? true : false;
            DataTable dtBand = ExtServices.GetRecordByValue("bands", " bndCode", HttpContext.Current.Session["curArtistCode"].ToString());
            DataTable dtPlaylistArtist = strUserPlaylist == "true" ? ExtServices.GetRecordByValue("playlists", " plaType", "200") : ExtServices.GetRecordByValue("playlists", " plaType", "201");
            //Determine artists for Tributes and Writing Credits
            List<string> lstValsPaths = new List<string>();
            List<string> lstValsReleases = new List<string>();
            List<string> lstValsWriters = new List<string>();
            //Release data
            string strRowSeparator = strCurReleaseName == "01.01.1000. Tributes" || strCurReleaseName == "01.01.1000. Writing Credits" ? "[#SEPARATOR]" : "";
            string strNumSeparatorA = strCurReleaseName == "01.01.1000. Tributes" || strCurReleaseName == "01.01.1000. Writing Credits" ? "[#NUM_SEP_A]" : "";
            string strNumSeparatorB = strCurReleaseName == "01.01.1000. Tributes" || strCurReleaseName == "01.01.1000. Writing Credits" ? "[#NUM_SEP_B]" : "";
            if (strCurReleaseName == "01.01.1000. Tributes" || strCurReleaseName == "01.01.1000. Writing Credits")
            {
                string[] strTributesReleases = strPlaylistTracks.Split('|');
                foreach (string strRelease in strTributesReleases)
                {
                    int pFrom = strRelease.IndexOf("^") + "^".Length;
                    int pTo = strRelease.LastIndexOf("^");

                    string strRelArtistId = strRelease.Substring(pFrom, pTo - pFrom);
                    string strRelTracks = strRelease.Replace("^" + strRelArtistId + "^", "");

                    //Get name from bands
                    DataTable dtTribBandId = ExtServices.GetRecordByValue("bands", "bndID", strRelArtistId);
                    if (dtTribBandId != null && dtTribBandId.Rows.Count > 0)
                    {
                        char charInitialCharTrib = dtTribBandId.Rows[0][1].ToString().ToUpper()[0];
                        string strTribBandName = dtTribBandId.Rows[0][1].ToString();
                        charInitialCharTrib = Char.IsDigit(charInitialCharTrib) ? '#' : Char.IsSymbol(charInitialCharTrib) ? '' : charInitialCharTrib;
                        string strTribReleasePath = HttpContext.Current.Session["currentDisk"].ToString() + "/Music/" + charInitialCharTrib + "/" + strTribBandName;
                        string[] strTracksTrib = strRelTracks.Split('■');
                        foreach (string strTrack in strTracksTrib)
                        {
                            if (strCurReleaseName == "01.01.1000. Tributes" && strTrack.Contains("{" + dtBand.Rows[0][0].ToString() + "_bnd"))
                            {
                                lstValsReleases.Add(strTrack);
                                lstValsPaths.Add(strTribReleasePath);
                            }
                            else if (strCurReleaseName == "01.01.1000. Writing Credits" && strTrack.Contains("["))
                            {
                                int pFromWr = strTrack.IndexOf("[") + "[".Length;
                                int pToWr = strTrack.LastIndexOf("]");
                                string strWriterIds = strTrack.Substring(pFromWr, pToWr - pFromWr);
                                string strTrackTitleWr = strTrack.Replace("[" + strWriterIds + "]", "");
                                lstValsPaths.Add(strTribReleasePath);
                                lstValsReleases.Add(strTrackTitleWr);
                                lstValsWriters.Add(strWriterIds);
                            }
                        }
                    }
                }
            }

            int intCountTracks = 0;
            int intCounterOfTracks = strPlaylistTracks.Count(f => f == '■');
            string[] strPlaylistTracksArray = strPlaylistTracks.Split('■');

            //Removing prefixes for tracks other than top tracks
            if (strCurReleaseName != "01.01.1000. Setlists")
            {
                if ((strUserPlaylist != "true" && strCurReleaseName != "01.01.1000. Top Tracks") || (strUserPlaylist == "true" && HttpContext.Current.Session["curPath"].ToString() != "userplaylist17"))
                {
                    if (!strPlaylistTracks.Contains("~"))
                    {
                        for (int i = 0; i < strPlaylistTracksArray.Length; i++)
                        {
                            strPlaylistTracksArray[i] = !strPlaylistTracksArray[i].ToString().Contains(HttpContext.Current.Session["currentServer"].ToString()) ? strPlaylistTracksArray[i].Substring(4) : strPlaylistTracksArray[i];
                        }
                    }
                    Array.Sort(strPlaylistTracksArray);
                }
            }

            //Remove duplicates
            string strNewPlaylistTracks = "";

            if (strCurReleaseName == "01.01.1000. Writing Credits")
            {
                string[] strWritCredTracks = strPlaylistTracksArray[0].Split('|');
                for (int i = 0; i < strWritCredTracks.Length; i++)
                {
                    if (!strNewPlaylistTracks.Contains(strWritCredTracks[i]))
                    {
                        strNewPlaylistTracks = strNewPlaylistTracks == "" ? strWritCredTracks[i] : strNewPlaylistTracks + '■' + strWritCredTracks[i];
                    }
                    else
                    {
                        lstValsPaths[i] = "";
                        lstValsReleases[i] = "";
                        lstValsWriters[i] = "";
                    }
                }
                //Removing empy values from lists
                lstValsPaths = lstValsPaths.Where(s => !string.IsNullOrWhiteSpace(s)).ToList();
                lstValsReleases = lstValsReleases.Where(s => !string.IsNullOrWhiteSpace(s)).ToList();
                lstValsWriters = lstValsWriters.Where(s => !string.IsNullOrWhiteSpace(s)).ToList();
                strPlaylistTracksArray = lstValsReleases.ToArray();
            }
            else
            {
                for (int i = 0; i < strPlaylistTracksArray.Length; i++)
                {
                    if (!strNewPlaylistTracks.Contains(strPlaylistTracksArray[i]) || strCurReleaseName == "01.01.1000. Tributes")
                    {
                        strNewPlaylistTracks = strNewPlaylistTracks == "" ? strPlaylistTracksArray[i] : strNewPlaylistTracks + '■' + strPlaylistTracksArray[i];
                    }
                }
            }

            strPlaylistTracksArray = strNewPlaylistTracks.Split('■');
            //remove duplicates with no casing
            if (strPlaylistTracksArray.Count() > 0 && strCurReleaseName != "01.01.1000. Setlists")
            {
                strPlaylistTracksArray = strPlaylistTracksArray.Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
            }

            int intCountTributes = 0;
            if (strCurReleaseName == "01.01.1000. Tributes")
            {
                //Convert track list to array so then strPlaylistTracksArray = newTrackArray
                strPlaylistTracksArray = lstValsReleases.ToArray();
            }
            string strWriterIDs = "";
            if (strCurReleaseName == "01.01.1000. Appearances")
            {
                strReleasePath = HttpContext.Current.Session["currentDisk"].ToString() + "/Music/V/Various Artists";
            }

            if (strCurReleaseName == "01.01.1000. Covers")
            {
                var seen = new HashSet<string>();
                strPlaylistTracksArray = strPlaylistTracksArray
                    .Where(entry =>
                    {
                        string key = entry.ToLower().Split('[')[0].Trim();
                        return seen.Add(key);
                    })
                    .ToArray();
            }
            List<string> lstCheckedPaths = new List<string>();
            string strPivotID = HttpContext.Current.Session["curArtistID"]?.ToString(), strBackupPath = "", strPivotHeader = "", strTourName = "";
            foreach (var strCurrentTrackTitle in strPlaylistTracksArray)
            {
                string strSongWebPath = "";
                string PlaTrackName = strCurrentTrackTitle.ToString().Replace("\"", "'");
                //Update path for tribute tracks
                string track = "";
                if (strCurReleaseName == "01.01.1000. Tributes" || strCurReleaseName == "01.01.1000. Writing Credits")
                {
                    strReleasePath = lstValsPaths[intCountTributes];
                    intCountTributes++;
                }
                else if (strUserPlaylist == "true")
                {
                    strReleasePath = PlaTrackName;
                    track = PlaTrackName.Replace(HttpContext.Current.Session["currentServer"].ToString(), HttpContext.Current.Session["currentDisk"].ToString() + "").Replace("%27", "'");
                    if (strUserPlaylist == "true" && !System.IO.File.Exists(track))
                    {
                        continue;
                    }

                    intCountTracks++;
                }
                //Get path using file name
                if (strUserPlaylist == "false" && isArtistPlaylist)
                {
                    if (strCurReleaseName == "01.01.1000. Covers" && PlaTrackName.Contains("{" + HttpContext.Current.Session["curArtistID"].ToString() + "_bnd}]"))
                    {
                        continue;
                    }
                    else if (strCurReleaseName == "01.01.1000. Covers" && PlaTrackName.Contains("_bnd}]"))
                    {
                        PlaTrackName = PlaTrackName.Replace("~", "").Replace("█", "'").Split('[')[0].ToString();
                    }
                    else if ((strCurReleaseName == "01.01.1000. Covers" || strCurReleaseName == "01.01.1000. Features" || strCurReleaseName == "01.01.1000. Tributes") && !PlaTrackName.Contains("_bnd}]"))
                    {
                        PlaTrackName = PlaTrackName.Replace("~", " ").Replace("█", "'").Substring(1);
                        if (strCurReleaseName == "01.01.1000. Features" && PlaTrackName.Contains(" {"))
                        {
                            PlaTrackName = PlaTrackName.Replace(" {", "{").Split('{')[0].ToString();
                        }
                    }
                    else if (strCurReleaseName == "01.01.1000. Collaborations" && PlaTrackName.Contains("~"))
                    {
                        PlaTrackName = PlaTrackName.Replace("~", "").Replace("█", "'");
                        if (PlaTrackName.Contains("^"))
                        {
                            string TrackArtist = PlaTrackName.Split('^')[1].ToString();
                            if (TrackArtist != strPivotID)
                            {
                                strPivotID = TrackArtist;
                                DataTable dtRelBand = ExtServices.GetRecordByValue("bands", "bndID", TrackArtist);
                                if (dtRelBand != null && dtRelBand.Rows.Count > 0 && dtRelBand.Rows[0][1] != null && dtRelBand.Rows[0][1].ToString() != "")
                                {
                                    string strNewBandName = dtRelBand.Rows[0][1].ToString();
                                    char charInitialCharBnd = strNewBandName.ToUpper()[0];
                                    charInitialCharBnd = Char.IsDigit(charInitialCharBnd) ? '#' : Char.IsSymbol(charInitialCharBnd) ? '' : charInitialCharBnd;
                                    strReleasePath = HttpContext.Current.Session["currentDisk"].ToString() + "/Music/" + charInitialCharBnd + "/" + strNewBandName;
                                    strBackupPath = strReleasePath;
                                }
                            }
                        }
                        if (PlaTrackName.Contains("{"))
                        {
                            PlaTrackName = PlaTrackName.Replace(" {", "{").Split('{')[0].ToString();
                        }
                    }
                    else if (strCurReleaseName == "01.01.1000. Top Tracks")
                    {
                        PlaTrackName = PlaTrackName.Replace("%36", "'");
                        if (PlaTrackName.Contains("version)"))
                        {
                            continue;
                        }
                    }
                    if (strReleasePath?.ToString() == "")
                    {
                        strReleasePath = HttpContext.Current.Session["currentDisk"].ToString() + "/" + HttpContext.Current.Session["curPageName"] + "/" + HttpContext.Current.Session["curArtistInitial"]?.ToString() + "/" + strCurrentArtist + "/Audio";
                    }
                    string strTrackNameNoBrackets = Regex.Replace(PlaTrackName, @"\[.*?\]", "");
                    if (strCurReleaseName == "01.01.1000. Tributes" && strTrackNameNoBrackets != null && strTrackNameNoBrackets.Contains("~"))
                    {
                        strTrackNameNoBrackets = strTrackNameNoBrackets.Replace("~", "").Replace("█", "'");
                    }
                    if (strCurReleaseName == "01.01.1000. Writing Credits" && strTrackNameNoBrackets != null && strTrackNameNoBrackets.Contains("^"))
                    {
                        strTrackNameNoBrackets = strTrackNameNoBrackets.Split('^').LastOrDefault();
                        if (strTrackNameNoBrackets.EndsWith(" "))
                        {
                            strTrackNameNoBrackets = strTrackNameNoBrackets.Substring(0, strTrackNameNoBrackets.Length - 1);
                        }
                    }
                    else if (strCurReleaseName == "01.01.1000. Setlists" && strTrackNameNoBrackets.EndsWith(" "))
                    {
                        strTrackNameNoBrackets = strTrackNameNoBrackets.Substring(0, strTrackNameNoBrackets.Length - 1);
                    }
                    else if (strCurReleaseName == "01.01.1000. Setlists" && strTrackNameNoBrackets.Contains("NOSHOWSFOUND"))
                    {
                        continue;
                    }

                    string[] strMatchingTracks = strCurReleaseName != "01.01.1000. Setlists" && strCurReleaseName != "01.01.1000. Covers" && strCurReleaseName != "01.01.1000. Covers" && strCurReleaseName != "01.01.1000. Covers" && strCurReleaseName != "01.01.1000. Covers" && strCurReleaseName != "01.01.1000. Features" && strCurReleaseName != "01.01.1000. Top Tracks" && strCurReleaseName != "01.01.1000. Tributes" && strCurReleaseName != "01.01.1000. Writing Credits" && strCurReleaseName != "01.01.1000. Collaborations" ?
                        Directory.GetFiles(strReleasePath.Replace("/" + strCurReleaseName, ""), "*" + PlaTrackName, SearchOption.AllDirectories)
                        : strCurReleaseName == "01.01.1000. Setlists" ? Directory.GetFiles(strReleasePath.Replace("/" + strCurReleaseName, ""), "*" + strTrackNameNoBrackets + "*.mp3", SearchOption.AllDirectories)
                        : Directory.GetFiles(strReleasePath.Replace("/" + strCurReleaseName, ""), "*" + strTrackNameNoBrackets + "*", SearchOption.AllDirectories);
                    Array.Sort(strMatchingTracks);

                    string strArtistToSearch = strCurrentArtist;
                    if (strCurReleaseName == "01.01.1000. Setlists" && strMatchingTracks.Count() == 0)
                    {
                        if (PlaTrackName.Contains("[") && PlaTrackName.Contains(" cover;") )
                        {
                            Match matchArtist = Regex.Match(PlaTrackName, @"\[(.*?) cover");
                            strArtistToSearch = matchArtist.ToString().Replace("[","").Replace(" cover","");
                        }
                        //Search on youtube
                        string query = strTrackNameNoBrackets + " " + strArtistToSearch;
                        string searchUrl = $"https://www.youtube.com/results?search_query={Uri.EscapeDataString(query)}";

                        var client = new HttpClient();
                        string html = client.GetStringAsync(searchUrl).GetAwaiter().GetResult();

                        Match match = Regex.Match(html, @"\/watch\?v=(.{11})");
                        if (match.Success)
                        {
                            string videoId = match.Groups[1].Value;
                            strSongWebPath = $"https://www.youtube.com/watch?v={videoId}";
                        }
                        else
                        {
                            strSongWebPath = searchUrl;
                        }
                    }
                    if (PlaTrackName.Contains("~"))
                    {
                        string strTrackNameResults = "";
                        if (strCurReleaseName != "01.01.1000. Writing Credits")
                        {
                            int start = PlaTrackName.LastIndexOf("~") + "~".Length;
                            int end = PlaTrackName.IndexOf("]", start);
                            strTrackNameResults = PlaTrackName.Remove(start, end - start);
                        }
                        else
                        {
                            int pFrom = PlaTrackName.IndexOf("~") + "~".Length;
                            int pTo = PlaTrackName.LastIndexOf("~");
                            strTrackNameResults = PlaTrackName.Substring(pFrom, pTo - pFrom);
                            strWriterIDs = lstValsWriters[intCountTracks];
                        }

                        strTrackNameResults = strTrackNameResults.Replace("~", "").Replace("]", "").Replace("_not_found", "").Replace("}", "");
                        strMatchingTracks = strMatchingTracks.Where(x => x.Contains(". " + strTrackNameResults.Replace("%36", "'").Replace("█", "'"))).ToArray();
                    }
                    else if (strCurReleaseName == "01.01.1000. Top Tracks" || HttpContext.Current.Session["curPath"].ToString() == "userplaylist17")
                    {
                        strMatchingTracks = strMatchingTracks.Where(x => x.ToLower().Contains(". " + PlaTrackName.ToLower().Replace("%36", "'").Replace("█", "'"))).ToArray();
                    }
                    else if (strCurReleaseName != "01.01.1000. Setlists" && strCurReleaseName != "01.01.1000. Covers" && strCurReleaseName != "01.01.1000. Features" && strCurReleaseName != "01.01.1000. Writing Credits")
                    {
                        strMatchingTracks = strMatchingTracks.Where(x => x.Contains(". " + PlaTrackName.Replace("%36", "'").Replace("█", "'"))).ToArray();
                    }
                    if (strCurReleaseName == "01.01.1000. Features")
                    {
                        strMatchingTracks = strMatchingTracks.Where(x => x.Contains("feat. ")).ToArray();
                        Array.Sort(strMatchingTracks);
                    }

                    if (strCurReleaseName == "01.01.1000. Top Tracks")
                    {
                        strMatchingTracks = strMatchingTracks.Where(x => !x.ToLower().Contains("instrumental")).ToArray();
                        string[] strOriginalLiveTracks = strMatchingTracks.Where(x => !x.ToLower().Contains("live at")).ToArray();
                        if (strOriginalLiveTracks.Count() > 0)
                        {
                            strMatchingTracks = strOriginalLiveTracks;
                        }
                        Array.Sort(strMatchingTracks);
                    }

                    if (strSongWebPath == "" && (strMatchingTracks == null || strMatchingTracks.Length == 0))
                    {
                        continue;
                    }

                    if (strCurReleaseName == "01.01.1000. Tributes" && strMatchingTracks.Count() > 0)
                    {
                        for (int i = 0; i < strMatchingTracks.Count(); i++)
                        {
                            if (strMatchingTracks[i].Contains(" cover]") && !lstCheckedPaths.Contains(strMatchingTracks[i]))
                            {
                                intCountTracks++;
                                track = strMatchingTracks[i];
                                lstCheckedPaths.Add(track);
                                break;
                            }
                            else if (strMatchingTracks[i].Contains(" cover]") && lstCheckedPaths.Contains(strMatchingTracks[i]))
                            {
                                strMatchingTracks = strMatchingTracks.Where((item, index) => index != i).ToArray();
                                i--;
                            }
                        }
                    }
                    else
                    {
                        if (strCurReleaseName != "01.01.1000. Setlists" || (strCurReleaseName == "01.01.1000. Setlists" && !PlaTrackName.Contains(";true;")))
                        {
                            intCountTracks++;
                        }
                        
                        track = strMatchingTracks.Count() > 0 ? strMatchingTracks[0] : strSongWebPath;
                    }
                }

                if (strCurReleaseName == "01.01.1000. Top Tracks")
                {
                    if (!lstCheckedPaths.Contains(track))
                    {
                        lstCheckedPaths.Add(track);
                    }
                    else
                    {
                        intCountTracks--;
                        continue;
                    }
                    if (lstCheckedPaths.Count() > 100)
                    {
                        break;
                    }
                }
                if (track == "" && strCurReleaseName == "01.01.1000. Tributes")
                {
                    continue;
                }
                string strFileName = strCurReleaseName == "01.01.1000. Setlists" && strSongWebPath != "" ? PlaTrackName : Path.GetFileNameWithoutExtension(track).Substring(4);
                string strFullName = strCurReleaseName == "01.01.1000. Setlists" && strSongWebPath != "" ? PlaTrackName : Path.GetFileName(track);
                string[] strSplitWebPath = track.Replace("\\", "/").Split('/');
                string strEditionFullName = strCurReleaseName == "01.01.1000. Setlists" && strSongWebPath != "" ? "" : strSplitWebPath[6];
                string strEditionDate = strCurReleaseName == "01.01.1000. Setlists" && strSongWebPath != "" ? "" : strEditionFullName.Substring(0, 12);
                string strWebPath = strCurReleaseName == "01.01.1000. Setlists" && strSongWebPath != "" ? strSongWebPath : track.Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/", "http://127.0.0.1:8887/").Replace("\\", "/").Replace("'", "%27");
                string strTrackNumber = intCounterOfTracks < 100 ? intCountTracks.ToString("D2") : intCountTracks.ToString("D3");

                if (strUserPlaylist == "true")
                {
                    HttpContext.Current.Session["curArtistName"] = strSplitWebPath[3];
                    HttpContext.Current.Session["curReleaseDate"] = strEditionDate;
                    dtBand = ExtServices.GetRecordByValue("bands", " bndName", strSplitWebPath[3].ToString());
                    if (dtBand != null && dtBand.Rows.Count > 0)
                    {
                        HttpContext.Current.Session["curArtistID"] = dtBand.Rows[0][0].ToString();
                    }
                }

                string strFeatures = "";
                string strCovers = "";
                string strOtherData = "";
                string strOriginPath = "";
                string strTrackType = strUserPlaylist == "true" ? strSplitWebPath[4].Substring(4).Replace("s [Music]", "") : HttpContext.Current.Session["curPath"].ToString().Substring(4).Replace("s [Music]", "");
                strTrackType = strCurReleaseName == "01.01.1000. Setlists" && strSongWebPath != "" ? "Setlist" : strTrackType;
                string strFileNameNoBrackets = strFileName;
                string strBracketContent = "";
                string strOriginalArtistPlaylist = "";
                string strTape = "", strHeader = "";
                if (strFileName.Contains(" ["))
                {
                    int start = strFileName.LastIndexOf(" [") + " [".Length;
                    int end = strFileName.IndexOf("]", start);
                    strFileNameNoBrackets = strFileName.Remove(start, end - start).Replace(" []", "");
                    strBracketContent = strFileName.Replace(strFileNameNoBrackets + " [", "").Replace(", ", ",").Replace(" [", "").Replace("]", "");
                    string[] strTrackDetails = strBracketContent.Split(';');
                    
                    if (strCurReleaseName == "01.01.1000. Setlists" && strSongWebPath != "" && strTrackDetails.Count() > 0)
                    {
                        strCovers = strTrackDetails[0].Replace(" cover","");
                        strOtherData = strTrackDetails[1];
                        strTape = strTrackDetails[2]!= null && strTrackDetails[2].ToLower().Contains("true") ? "<i class='fa fa-file-audio' style='font-size: 18px;'></i>": "";
                        if (strPivotHeader != strTrackDetails[3].ToString())
                        {
                            strPivotHeader = strTrackDetails[3].ToString();
                            strHeader = strTrackDetails[3] != null && strTrackDetails[3].ToString() != "" ? "<div class='editionRow' data-edition='" + strTrackDetails[3] + "' style='padding:5px; padding-left:5px; cursor:pointer'><a class='anchorTrack editionTrack coloredText' href='javascript:void(0)' style='text-decoration:none;cursor:default;font-weight: 600; color:aliceblue'>" + strTrackDetails[3] + "</a></div>" : "";
                        }
                        strTourName = strTrackDetails[4]?.ToString().Replace("/", "-").Replace(":", " -");
                    }
                    else
                    {

                        string strExtraData = "";
                        if (strCurReleaseName == "01.01.1000. Setlists")
                        {
                            int startB = PlaTrackName.LastIndexOf(" [") + " [".Length;
                            int endB = PlaTrackName.IndexOf("]", startB);
                            string strFileNameNoBracketsB = PlaTrackName.Remove(startB, endB - startB).Replace(" []", "");
                            string strBracketContentB = PlaTrackName.Replace(strFileNameNoBracketsB + " [", "").Replace(", ", ",").Replace(" [", "").Replace("]", "");
                            string[] strTrackDetailsB = strBracketContentB.Split(';');

                            strExtraData = strTrackDetailsB[1];
                            strTape = strTrackDetailsB[2] != null && strTrackDetailsB[2].ToLower().Contains("true") ? "<i class='fa fa-file-audio' style='font-size: 18px;'></i>" : "";
                            if (strPivotHeader != strTrackDetailsB[3].ToString())
                            {
                                strPivotHeader = strTrackDetailsB[3].ToString();
                                strHeader = strTrackDetailsB[3] != null && strTrackDetailsB[3].ToString() != "" ? "<div class='editionRow' data-edition='" + strTrackDetailsB[3] + "' style='padding:5px; padding-left:5px; cursor:pointer'><a class='anchorTrack editionTrack coloredText' href='javascript:void(0)' style='text-decoration:none;cursor:default;font-weight: 600; color:aliceblue'>" + strTrackDetailsB[3] + "</a></div>" : "";
                            }
                            strTourName = strTrackDetailsB[4]?.ToString().Replace("/","-").Replace(":", " -");
                        }

                        foreach (string detail in strTrackDetails)
                        {
                            string strDetail = detail.Replace("'", "\'");

                            if (strDetail.Contains("Tkn from"))
                            {
                                strDetail = strDetail.Replace("Tkn from", "Taken from");
                            }
                            if (strDetail.ToLower().Contains("feat. "))
                            {
                                strFeatures = strDetail;
                            }

                            else if (strDetail.Contains("Taken from")) //For links
                            {
                                strOriginPath = strDetail;
                            }

                            else if (strDetail.Contains(" cover"))
                            {
                                strCovers = strDetail;
                                strFileName = strFileName.ToLower().Contains("; " + strCovers.ToLower()) ? strFileName.Replace("; " + strCovers, "") : strFileName.ToLower().Contains(strCovers.ToLower() + ";") ? strFileName.Replace(strCovers + ";", "") : strFileName.ToLower().Contains(strCovers) ? strFileName.Replace(strCovers, "") : strFileName;
                            }

                            else if (!strFeatures.ToLower().Contains(strDetail) && !strCovers.ToLower().Contains(strDetail))
                            {
                                strOtherData = strExtraData == "" ? strDetail : strDetail + ", " + strExtraData;
                                if (strDetail.StartsWith("by ", StringComparison.OrdinalIgnoreCase) || strDetail.StartsWith(" by ", StringComparison.OrdinalIgnoreCase))
                                {
                                    strOriginalArtistPlaylist = strDetail.Replace(" by ", "").Replace("by ", "");
                                }
                            }
                        }
                    }
                }
                string strShowDate = HttpContext.Current.Session["tourFirstDate"]?.ToString();
                if (strTourName == "" && strCurReleaseName == "01.01.1000. Setlists" && PlaTrackName.Contains(";"))
                {
                    strTourName = PlaTrackName.Split(';').LastOrDefault().Replace("/", "-").Replace("]", "");
                }

                string strDuration = "";
                if (strCurReleaseName == "01.01.1000. Setlists" && strTape == "" && PlaTrackName.Contains(";true;"))
                {
                    strTape = "<i class='fa fa-file-audio' style='font-size: 18px;'></i>";
                }
                if (!track.Contains(".lnk") && !track.Contains("https://www.youtube.com"))
                {
                    AudioFile ObjAF = new AudioFile(track);
                    double dblDuration = ObjAF.Properties.Duration.TotalSeconds;
                    TimeSpan time = TimeSpan.FromSeconds(dblDuration);
                    strDuration = time.ToString(@"mm\:ss");
                }

                //Get duration for lnk's: Find the file
                else if (strOriginPath != "")
                {
                    List<string> lstVariables = LinkPath(strOriginPath, strCurrentArtist, track, strFullName, strFileName, strDuration, strWebPath);

                    strFullName = lstVariables[0];
                    strFileName = lstVariables[1];
                    strDuration = lstVariables[2];
                    strWebPath = lstVariables[3];
                }

                string strSubBracketContent = "";

                if (strCurReleaseName == "01.01.1000. Appearances")
                {
                    //Removing performances of current band
                    strFileName = strFileName.Replace("Performed by " + dtBand.Rows[0][1].ToString(), "").Replace(" []", "").Replace("[]", "");
                }

                if ((strCurReleaseName != "01.01.1000. Setlists" && strFileName.Contains("[") && strFileName.Contains("]")) || (strCurReleaseName == "01.01.1000. Setlists" && strBracketContent != "" && !track.Contains("https://www.youtube.com")))
                {
                    strFileName = strFileName.Replace("[]", "").Replace("[", "(").Replace("]", ")");
                    int startExtra = strFileName.LastIndexOf(" (") + " (".Length;
                    int endExtra = strFileName.IndexOf(")", startExtra);
                    strFileNameNoBrackets = strFileName.Remove(startExtra, endExtra - startExtra).Replace(" ()", "");
                    strBracketContent = strFileName.Replace(strFileNameNoBrackets + " (", "").Replace(" (", "").Replace(")", "");
                    strBracketContent = !string.IsNullOrEmpty(strBracketContent) && (strBracketContent[0] == ' ' || strBracketContent[0] == '\t') ? strBracketContent.Substring(1) : strBracketContent;
                    if (strCurReleaseName == "01.01.1000. Setlists")
                    {
                        strCovers = strCovers.Replace(" cover", "");
                        strCovers = strCovers.StartsWith(" ") ? strCovers.Substring(1) : strCovers;
                        string strSongType = strTape == "" ? " cover" : " song";
                        strBracketContent = strCovers != "" && strOtherData != "" ? strCovers + strSongType + ", " + strOtherData : strCovers != "" && strOtherData == "" ? strCovers + strSongType : strCovers == "" && strOtherData != "" ? strOtherData : "";
                    }
                    strFileName = strFileNameNoBrackets + " <a class='anchorTrack titleExtra coloredText' href='javascript:void(0)' style='color: aliceblue; font-size:10px; text-decoration:none'>(" + strBracketContent.Replace(";", ",") + ", Previously Unreleased)</a>";
                    strSubBracketContent = !strBracketContent.Contains("feat.") && !strBracketContent.Contains(" cover") ? strBracketContent : "";
                }

                else if (strCurReleaseName == "01.01.1000. Setlists" && strBracketContent != "" && track.Contains("https://www.youtube.com"))
                {
                    string strSongTypeB = strTape == "" ? " cover" : " song";
                    strBracketContent = strCovers != "" && strOtherData != "" ? strCovers + strSongTypeB + ", " + strOtherData : strCovers != "" && strOtherData == "" ? strCovers + strSongTypeB : strCovers == "" && strOtherData != "" ? strOtherData : "" ;
                    strFileName = strFileNameNoBrackets + " <a class='anchorTrack titleExtra coloredText' href='javascript:void(0)' style='color: aliceblue; font-size:10px; text-decoration:none'>(" + strBracketContent.Replace(";", ",") + ")</a>";
                }

                if (!strWebPath.Contains(".lnk") && strTrackType.Contains("Compilation") && strSubBracketContent == "")
                {
                    strFileName = strFileName.Replace("color: aliceblue;", "");
                }
                
                else
                {
                    strFileName = strFileName.Replace(" coloredText", "").Replace(", Previously Unreleased", "");
                }

                if (track.Contains("03. Compilations [Music]") && strWebPath.Contains(".lnk"))
                {
                    strWebPath = strWebPath.Replace(".lnk", "");
                }
                string strRowNumber = strTape == "" ? strNumSeparatorA + strTrackNumber + strNumSeparatorB + "." : strTape;
                strContentTrack = strContentTrack + strHeader + "<div class='row playlistTrack trackRow' data-tracktitle = '" + strFileNameNoBrackets.Replace("'", "%26") + "' data-fullname='" + strFullName.Replace("'", "%27") + "' data-writer='data-writer" + strWriterIDs + 
                    "' data-webpath='" + strWebPath + "' data-feat='" + strFeatures.Replace("'", "%27") + "' data-tracktype='" + strTrackType.Replace("'", "%27") +
                    "' data-cover='" + strCovers.Replace("'", "%27") + "' data-other='" + strOtherData.Replace("'", "%27") + "' data-performingArtist ='" + strOriginalArtistPlaylist + "' data-edition='" + strEditionFullName.Replace("'", "%27") +
                    "' data-editionDate ='" + strEditionDate.Replace("'", "%27") + "' data-disc='' data-tour='"+ strTourName + "' data-showdate='" + strShowDate + "' style='padding:10px; padding-right:15px; cursor:pointer'>" +
                    "<div class='controlWrapper'><div class='col-1 controlTrack' style='display:none'><a class='anchorTrack' href='javascript:void(0)' style='color: aliceblue; text-decoration:none;'><i class='fa fa-play'></i></a></div>" +
                    "<div class='col-1 numberTrack'><a class='anchorTrack' href='javascript:void(0)' style='color: aliceblue;text-decoration:none'>" + strRowNumber + "</a></div></div>" +
                    "<div class='col-10'><a class='anchorTrack titleTrack' href='javascript:void(0)' style='color: aliceblue; text-decoration:none'>" + strFileName.Replace(" language version", " version") + "</a></div>" +
                    "<div class='col-1'><a class='anchorTrack lengthTrack' href='javascript:void(0)' style='color: aliceblue; text-decoration:none;'>" + strDuration + "</a></div>" +
                    "</div>" + strRowSeparator;
                strShowDate = "";
            }

            string strPlaylistDesc = "";
            if (strCurReleaseName != "01.01.1000. Setlists")
            {
                for (int i = 0; i < dtPlaylistArtist.Rows.Count; i++)
                {
                    if (strCurReleaseName.Contains(dtPlaylistArtist.Rows[i][1].ToString()))
                    {
                        strPlaylistDesc = dtPlaylistArtist.Rows[i][3].ToString().Replace("bnd_name", strCurArtist);
                        break;
                    }
                }
            }

            //Sort content in case a separator exists
            if (strContentTrack.Contains("[#SEPARATOR]"))
            {
                strContentTrack = strContentTrack.Replace("[#SEPARATOR]", "█");
                string[] strHTMLArray = strContentTrack.Split('█');
                Array.Sort(strHTMLArray);

                for (int i = 0; i < strHTMLArray.Length; i++)
                {
                    if (strHTMLArray[i].ToString() != "")
                    {
                        string strTrackNumberTrib = i < 100 ? i.ToString("D2") : i.ToString("D3");
                        int pFrom = strHTMLArray[i].ToString().IndexOf(strNumSeparatorA) + strNumSeparatorA.Length;
                        int pTo = strHTMLArray[i].ToString().LastIndexOf(strNumSeparatorB);
                        string strResultNumber = strHTMLArray[i].ToString().Substring(pFrom, pTo - pFrom);
                        strHTMLArray[i] = strHTMLArray[i].ToString().Replace(strNumSeparatorA + strResultNumber + strNumSeparatorB, strTrackNumberTrib);
                    }
                }

                strContentTrack = string.Join("█", strHTMLArray);
                strContentTrack = strContentTrack.Replace("█", "");
            }

            if (strCurReleaseName == "01.01.1000. Setlists" && strSkipContainer == "")
            {
                strContentTrack = "<div id='trackListContents'>" + strContentTrack + "</div>";
            }
            return strContentTrack + "®" + strPlaylistDesc;
        }

        [System.Web.Services.WebMethod]
        public async Task<List<string>> SetlistSelect(string strYear = "", string strID = "", List<Dictionary<string, string>> lstSetlists = null)
        {
            List<string> lstSetlistData = new List<string>();
            if (lstSetlists == null || HttpContext.Current.Session["curSelectedYear"].ToString() != strYear)
            {
                Session["curSelectedYear"] = HttpContext.Current.Session["curSelectedYear"].ToString() != strYear ? strYear : HttpContext.Current.Session["curSelectedYear"].ToString();
                lstSetlists = GetSetlists(strYear, strID).GetAwaiter().GetResult();
            }
            string strShowOptions = "";
            if (lstSetlists != null && lstSetlists.Count > 0)
            {

                strShowOptions = "";
                string strSelected = "selected";
                int intCountItems = 0;
                foreach (var setlist in lstSetlists)
                {
                    if (intCountItems == 0)
                    {
                        Session["tourFirstDate"] = setlist["date"];
                        intCountItems++;
                    }

                    string strSetID = setlist["id"];
                    string strSetDate = setlist["date"];
                    string strSetVenue = setlist["venue"];
                    string strSetCity = setlist["city"];
                    string strSetState = setlist["countrycode"] == "us" ? ", " + setlist["state"] : "";
                    string strSetCountry = setlist["country"];
                    string strSetCountryCode = setlist["countrycode"];
                    string strSetTour = setlist["tour"];
                    string strSetSongs = setlist["songs"];

                    DateTime date = DateTime.ParseExact(strSetDate, "yyyy.MM.dd", null);
                    string formattedDate = date.ToString("MMM dd"); // "Dec 25"

                    string strFlag = strSetCountryCode + ";" + strSetID + ";"; // "<span style='margin-left:10px'><img src='/Images/Flags/" + strSetCountryCode + ".svg' width=25px' style='margin-top:-5px; margin-right:5px'/>";
                    string strOptTitle = formattedDate + ". " + strSetVenue + ", " + strSetCity + strSetState + ", " + strSetCountry + ".";
                    strOptTitle = strOptTitle.Replace(", , ", ", ");

                    strShowOptions += "<option value='"+ strSetID + "' "+ strSelected + " data-id='" + strSetID + "' data-date='" + strSetDate + "' data-tour='" + strSetTour + "' data-songs='"+ strSetSongs.Replace(";","^") +"'>"+ strFlag + strOptTitle + ";" + strSetSongs.Replace(";", "^") + ";" + strSetDate + "</option>";
                    if (strSelected != "")
                    {
                        strSelected = "";
                        lstSetlistData.Add(strSetSongs);
                    }
                }
            }
            else
            {
                strShowOptions += "<option value='NOSHOWSFOUND' data-id='NOSHOWSFOUND' selected disabled data-date='" + strYear + "' data-tour='NOSHOWSFOUND' data-songs='NOSHOWSFOUND'>No shows found during this year</option>";
            }

            string strSelectSetlist = "<div id='selectSetlistShow' class='divSubFilter divSubFilterSelect' style='margin-top:-17px' data-value='" + strYear + "'>"
                + "<select id='ShowOptSelect' class='form-control inputField input-sm select2' data-id='0' data-table='" + "NONE" + "' data-field='" + "NONE" + "' style='width:500px' >" + strShowOptions
                + "</select></div>";
            lstSetlistData.Add(strSelectSetlist);

            return lstSetlistData;
        }

        private async Task<List<Dictionary<string, string>>> GetSetlists(string strYear = "", string strID = "")
        {
            List<Dictionary<string, string>> listShowData = new List<Dictionary<string, string>>();
            string strTracklist = "";
            strYear = strYear == "" ? HttpContext.Current.Session["curEndDate"]?.ToString() : strYear;
            DataTable dtAuth = ExtServices.GetRecordByValue("apiauth", "apiName", "Setlist.fm");
            string apiKey = dtAuth.Rows[0][2].ToString();
            string artistMbid = HttpContext.Current.Session["curArtistCode"].ToString();
            try
            {
                var client = new HttpClient();
                client.DefaultRequestHeaders.Add("x-api-key", apiKey);
                client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
                client.DefaultRequestHeaders.UserAgent.ParseAdd("MediaBinger/1.0 (mediabingerapps@gmail.com)");
                int page = 1;
                bool hasMore = true;

                List<JsonElement> nonEmptySetlists = new List<JsonElement>();
                while (hasMore)
                {
                    string url = strID == "" ? $"https://api.setlist.fm/rest/1.0/search/setlists?artistMbid={artistMbid}&year={strYear}&p={page}" : $"https://api.setlist.fm/rest/1.0/setlist/{strID}";
                    var response = client.GetAsync(url).GetAwaiter().GetResult();
                    System.Threading.Thread.Sleep(150);

                    if (!response.IsSuccessStatusCode)
                    {
                        Console.WriteLine($"Error: {response.StatusCode}");
                        break;
                    }

                    string json = await response.Content.ReadAsStringAsync();
                    JsonDocument doc = JsonDocument.Parse(json);

                    var setlists = doc.RootElement.GetProperty("setlist");
                    int count = 0;

                    foreach (var setlist in setlists.EnumerateArray())
                    {
                        strTracklist = "";
                        var sets = setlist.GetProperty("sets").GetProperty("set");
                        if (sets.GetArrayLength() > 0)
                        {
                            var dicShowData = new Dictionary<string, string>();

                            // ID
                            if (setlist.TryGetProperty("id", out var idProp))
                                dicShowData["id"] = idProp.GetString() ?? "";

                            // Date (formatted as YYYY.MM.DD)
                            if (setlist.TryGetProperty("eventDate", out var dateProp))
                            {
                                string inputDate = dateProp.GetString();
                                if (DateTime.TryParseExact(inputDate, "dd-MM-yyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
                                {
                                    dicShowData["date"] = date.ToString("yyyy.MM.dd");
                                }
                                else
                                    dicShowData["date"] = dateProp.GetString() ?? "";
                            }

                            // Venue
                            if (setlist.TryGetProperty("venue", out var venueProp))
                            {
                                if (venueProp.TryGetProperty("name", out var venueNameProp))
                                    dicShowData["venue"] = venueNameProp.GetString() ?? "";

                                // City
                                if (venueProp.TryGetProperty("city", out var cityProp))
                                {
                                    if (cityProp.TryGetProperty("name", out var cityNameProp))
                                        dicShowData["city"] = cityNameProp.GetString() ?? "";

                                    if (cityProp.TryGetProperty("stateCode", out var stateCodeProp))
                                        dicShowData["state"] = stateCodeProp.GetString() ?? "";
                                    // Country
                                    if (cityProp.TryGetProperty("country", out var countryProp))
                                    {
                                        if (countryProp.TryGetProperty("name", out var countryNameProp))
                                            dicShowData["country"] = countryNameProp.GetString() ?? "";

                                        if (countryProp.TryGetProperty("code", out var countryCodeProp))
                                            dicShowData["countrycode"] = countryCodeProp.GetString()?.ToLower() ?? "";
                                    }
                                }
                            }

                            // Tour
                            if (setlist.TryGetProperty("tour", out var tourProp) &&
                                tourProp.TryGetProperty("name", out var tourNameProp))
                            {
                                dicShowData["tour"] = tourNameProp.GetString() ?? "";
                            }
                            else if (setlist.TryGetProperty("venue", out var newVenueProp))
                            {
                                dicShowData["tour"] = "Live at " + dicShowData["venue"];
                            }
                            else
                            {
                                dicShowData["tour"] = "Live at " + dicShowData["date"];
                            }

                            //Songs
                            foreach (var set in sets.EnumerateArray())
                            {
                                string setName = set.TryGetProperty("name", out var nameProp) ? nameProp.GetString() ?? "" : "";

                                if (setName == "")
                                {
                                    setName = set.TryGetProperty("encore", out var encoreProp) ? encoreProp.GetInt32().ToString() ?? "" : "";
                                    setName = setName == "1" ? "Encore" : setName != "" ? "Encore " + setName : "";
                                }

                                if (set.TryGetProperty("song", out var songs))
                                {
                                    foreach (var song in songs.EnumerateArray())
                                    {
                                        string songName = song.TryGetProperty("name", out var songNameProp) ? songNameProp.GetString() ?? "" : "";
                                        string coverName = song.TryGetProperty("cover", out var coverProp) && coverProp.TryGetProperty("name", out var coverNameProp) ? coverNameProp.GetString() ?? "" : "";
                                        coverName = coverName != "" ? coverName + " cover" : "";
                                        string info = song.TryGetProperty("info", out var infoProp) ? infoProp.GetString() ?? "" : "";
                                        string tape = song.TryGetProperty("tape", out var tapeProp) ? tapeProp.GetBoolean().ToString().ToLower(): "false";
                                        string tour = dicShowData["tour"];
                                        strTracklist += $"{songName} [{coverName};{info};{tape};{setName};{tour}]■";
                                    }
                                    
                                }
                            }
                            strTracklist = strTracklist.Substring(0, strTracklist.Length - 1);
                            dicShowData["songs"] = strTracklist;
                            listShowData.Add(dicShowData);
                            nonEmptySetlists.Add(setlist);
                            count++;
                        }
                    }
                    hasMore = setlists.GetArrayLength() > 0;
                    page++;
                }
            }
            catch (Exception ex)
            {

            }
            return listShowData;
        }

        private string strContentTrack(string strReleasePath, string strItemType, string strCurArtist, List<string> lstVideoLinks)
        {
            string strContentTrack = "";
            if (strReleasePath == "Promo Material" && lstVideoLinks.Count > 0)
            {
                int intCountVidLinks = 1;
                foreach (string videoData in lstVideoLinks)
                {
                    string[] strVideoData = videoData.Split(';');
                    string strExtraData = "", strDirector = strVideoData[3].ToString() != "" ? strVideoData[3].ToString() : strCurArtist;
                    string strURLDir = "https://en.wikipedia.org/wiki/" + strDirector;

                    try
                    {
                        HttpWebRequest request = WebRequest.Create(strURLDir) as HttpWebRequest;
                        request.Method = "HEAD";
                        HttpWebResponse response = request.GetResponse() as HttpWebResponse;
                        response.Close();
                    }
                    catch
                    {
                        strURLDir = "https://www.google.com/search?q=" + strDirector.Replace(" ", "+");
                    }

                    if (strVideoData[2].ToString() != "")
                    {
                        try
                        {
                            HttpWebRequest request = WebRequest.Create(strVideoData[2].ToString()) as HttpWebRequest;
                            request.Method = "HEAD";
                            HttpWebResponse response = request.GetResponse() as HttpWebResponse;
                            response.Close();
                        }
                        catch
                        {
                            continue;
                        }
                    }
                    strExtraData = " <a class='anchorTrack titleExtra coloredText' href='javascript:void(0)' style='color: aliceblue; font-size:10px; text-decoration:none'>(By </a>" +
                            "<a href='" + strURLDir + "' target='_blank' class='anchorProd coloredText' style='font-weight:bold;text-decoration:none; cursor:pointer; font-size:10px'>" + strDirector +
                            "</a><a class='anchorTrack titleExtra coloredText' href='javascript:void(0)' style='color: aliceblue; font-size:10px; text-decoration:none'>)</a>";

                    strContentTrack = strContentTrack + "<div class='row trackRow videoRow promoMaterialRow' data-webpath='" + strVideoData[2].ToString() + "' data-fullname='" + strVideoData[1].ToString().Replace("'", "%27") +
                                        "' data-feat='' data-tracktype='Video' data-cover='' data-other='' data-edition='' data-editionDate ='"+ strVideoData[0].ToString() + "' data-performingArtist ='' data-disc='Promo Material' style='padding:10px; padding-right:15px; cursor:pointer'>" +
                                        "<div class='controlWrapper'><div class='col-1 controlTrack' style='display:none'><a class='anchorTrack' href='javascript:void(0)' style='color: aliceblue; text-decoration:none;'><i class='fa fa-play'></i></a></div>" +
                                        "<div class='col-1 numberTrack'><a class='anchorTrack' href='javascript:void(0)' style='color: aliceblue;text-decoration:none'>" + intCountVidLinks.ToString("D2") + ".</a></div></div>" +
                                        "<div class='col-10'><a class='anchorTrack titleTrack' href='javascript:void(0)' style='color: aliceblue; text-decoration:none'>" + strVideoData[1].ToString() + strExtraData + "</a></div>" +
                                        "<div class='col-1'><a class='anchorTrack lengthTrack' href='javascript:void(0)' style='color: aliceblue; text-decoration:none;'></a></div>" +
                                   "</div>";
                    intCountVidLinks++;
                }
                return strContentTrack;
            }
            
            if (strReleasePath.ToLower().Contains("audio") || strReleasePath.ToLower().Contains("video"))
            {
                strReleasePath = strReleasePath.Replace("\\", "/");
                string strFoldersToSearch = strReleasePath.ToLower().Contains("/audio") && Session["curPath"].ToString() != "Singles" ? Session["curPath"].ToString() + ";Singles" : Session["curPath"].ToString();
                strFoldersToSearch = strFoldersToSearch.Replace("Singles;Singles", "Singles");
                string strPrevFolder = "";
                foreach (string folder in strFoldersToSearch.Split(';'))
                {
                    strReleasePath = strReleasePath.Replace("/" + Session["curPath"].ToString(), "/" + folder);
                    if (!Directory.Exists(strReleasePath))
                        continue;
                    string extensionsToExclude = strReleasePath.ToLower().Contains("/albums") || strPrevFolder != "" ? ".png,.jpg,.ini,.pdf,.lnk" : ".png,.jpg,.ini,.pdf";
                    bool isSingleSub = folder == "Singles" && strPrevFolder != "" && strPrevFolder != folder ? true : false;
                    strPrevFolder = folder;
                    var excludeExtensions = extensionsToExclude.Split(',').Select(ext => ext.Trim()).ToList();
                    string[] strAllTracks = Directory.GetFiles(strReleasePath, "*.*", SearchOption.AllDirectories)?.Where(file => !excludeExtensions.Contains(Path.GetExtension(file), StringComparer.OrdinalIgnoreCase) && !file.Contains("[Artwork]")).ToArray();
                    string[] strAllVideoLinks = Directory.GetFiles(strReleasePath, "*.*", SearchOption.AllDirectories)?.Where(file => excludeExtensions.Contains(".lnk", StringComparer.OrdinalIgnoreCase) && !file.Contains("[Artwork]") && file.Contains("[Video].lnk")).ToArray();
                    
                    string[] strAllFiles = strReleasePath.ToLower().Contains("/albums") ? strAllTracks.Concat(strAllVideoLinks).ToArray() : strAllTracks;
                    if (!strReleasePath.Contains("Various Artists"))
                    {
                        string[] strAllLinks = Directory.GetFiles(strReleasePath, "*.*", SearchOption.AllDirectories)?.Where(file => excludeExtensions.Contains(".lnk", StringComparer.OrdinalIgnoreCase) && !file.Contains("[Artwork]") && file.Contains("[") && file.Contains("by ") && file.Contains(".lnk")).ToArray();
                        strAllFiles = strReleasePath.ToLower().Contains("/albums") ? strAllTracks.Concat(strAllVideoLinks).Concat(strAllLinks).ToArray() : strAllTracks;
                    }
                    Array.Sort(strAllFiles);
                    string strHeader = "", strEditionNamePivot = "", strDiscNamePivot = "";
                    int intCountAudio = 0, intCountBsides = 1;
                    bool isBoxSet =
                        folder == "Compilations" ? strAllFiles.All(file => Path.GetExtension(file).Equals(".lnk", StringComparison.OrdinalIgnoreCase) && Path.GetFileNameWithoutExtension(file).Contains(" Edition]"))
                        : false;

                    List<string> lstBoxSetHeaders = new List<string>();
                    //Box set tracklist - Singles tracklist
                    if (isBoxSet || strItemType == "song")
                    {
                        List<string> newPaths = new List<string>();
                        foreach (string disc in strAllFiles)
                        {
                            string strDiscName = Path.GetFileNameWithoutExtension(disc).Substring(4);
                            string[] segments = strReleasePath.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                            string rootPath = string.Join("/", segments.Take(4));
                            Match match = Regex.Match(strDiscName, @"^(.*?)\s*\[(.*?)\]$");
                            string nameWithoutBrackets = match.Success ? match.Groups[1].Value.Trim() : strDiscName;
                            string bracketContent = match.Success ? match.Groups[2].Value.Trim() : "";
                            string[] strDiscPath = Directory.GetDirectories(rootPath, "*", SearchOption.AllDirectories)
                                .Where(dir => Path.GetFileName(dir).Length > 12 && Path.GetFileName(dir).Substring(12).Equals(nameWithoutBrackets, StringComparison.OrdinalIgnoreCase)).ToArray();
                            Array.Sort(strDiscPath);
                           
                            if (strDiscPath.Count() > 0)
                            {
                                //Check for title track singles
                                // Normalize slashes
                                string normalizedPath = strDiscPath.LastOrDefault().Replace('\\', '/');
                                int titleTrackCount = Regex.Matches(normalizedPath, strDiscName, RegexOptions.IgnoreCase).Count;
                                //bool containsSingles = normalizedPath.Contains("/Singles/");
                                if (titleTrackCount < 2)
                                {
                                    foreach (var path in strDiscPath)
                                    {
                                        string[] discTracks = Directory.Exists(Path.Combine(path, "[Artwork]"))
                                            ? Directory.GetFiles(path).Where(f => !f.EndsWith(".ico", StringComparison.OrdinalIgnoreCase)
                                            && !f.EndsWith(".ini", StringComparison.OrdinalIgnoreCase))
                                            .ToArray()
                                            : Directory.GetDirectories(path, "*" + bracketContent + "*", SearchOption.AllDirectories)
                                            .SelectMany(dir => Directory.GetFiles(dir, "*", SearchOption.AllDirectories)
                                            .Where(f =>
                                            {
                                            // Get the directory that contains the file
                                            string[] parts = Path.GetDirectoryName(f)?.Split(Path.DirectorySeparatorChar);
                                                return parts != null &&
                                                !parts.Any(p => p.Equals("[Artwork]", StringComparison.OrdinalIgnoreCase)) &&
                                                !f.EndsWith(".ico", StringComparison.OrdinalIgnoreCase) &&
                                                !f.EndsWith(".ini", StringComparison.OrdinalIgnoreCase);
                                            }))
                                            .ToArray();

                                        if (strItemType == "song" && discTracks.Count() == 0)
                                        {
                                            discTracks = strAllFiles;
                                        }

                                        Array.Sort(discTracks);
                                        foreach (var sourcePath in discTracks)
                                        {
                                            if (Path.GetExtension(sourcePath).Equals(".lnk", StringComparison.OrdinalIgnoreCase))
                                            {
                                                string targetFileName = Path.GetFileNameWithoutExtension(sourcePath).Substring(4);
                                                string strMatch = Directory.GetFiles(rootPath, "*", SearchOption.AllDirectories)
                                                    .Where(f => !Path.GetExtension(f).Equals(".lnk", StringComparison.OrdinalIgnoreCase))
                                                    .Where(f => {
                                                        string candidate = Path.GetFileNameWithoutExtension(f);
                                                        return candidate.Length > targetFileName.Length && candidate.EndsWith(targetFileName, StringComparison.OrdinalIgnoreCase);
                                                    }).FirstOrDefault();

                                                newPaths.Add(strMatch ?? sourcePath); // Add resolved match or original .lnk path
                                            }
                                            else
                                            {
                                                newPaths.Add(sourcePath); // Non-.lnk path goes as-is
                                            }

                                            if (isBoxSet)
                                            {
                                                lstBoxSetHeaders.Add(nameWithoutBrackets);
                                            }
                                            else if (strItemType == "song")
                                            {
                                                string parentFolder = Path.GetFileName(Path.GetDirectoryName(sourcePath));
                                                string cleanName = parentFolder.Length > 12 ? parentFolder.Substring(12) : parentFolder;
                                                lstBoxSetHeaders.Add(cleanName);
                                            }
                                        }
                                        break;
                                    }
                                }
                                
                            }

                            if (strItemType == "song")
                            {
                                break;
                            }

                        }
                        strAllFiles = newPaths.Count > 0 ? newPaths.ToArray() : strAllFiles;
                        if (strItemType == "song")
                        {
                            var normalized = strAllFiles.Select(path => path.Replace('\\', '/').Replace("audio", "Audio")).ToArray();
                            var seen = new HashSet<string>();
                            var indexesToRemove = new List<int>();

                            for (int i = 0; i < normalized.Length; i++)
                            {
                                if (!seen.Add(normalized[i]))
                                {
                                    indexesToRemove.Add(i);
                                }
                            }

                            strAllFiles = normalized.Where((_, i) => !indexesToRemove.Contains(i)).ToArray();
                            lstBoxSetHeaders = lstBoxSetHeaders.Where((_, i) => !indexesToRemove.Contains(i)).ToList();
                        }
                    }

                    int intCountBoxSetIndex = 0, intCountBoxSetTracks = 1, intCountVideos = 0;
                    bool isLinkedFolder = false;
                    string strLinkVideoType = strReleasePath.Contains("Video Collection") ? "Music Video" : "Live Performance";
                    DataTable dtLinkedVideos = new DataTable();
                    if (strReleasePath.Contains("Video Collection") || strReleasePath.Contains("Live Performances"))
                    {
                        // Add Links from database
                        isLinkedFolder = true;
                        dtLinkedVideos = ExtServices.GetRecordByTwoValues("videosource", "visParentID", Session["curArtistID"].ToString(), "visType", strLinkVideoType, "visID", "ASC");

                        if (dtLinkedVideos != null && dtLinkedVideos.Rows.Count > 0)
                        {
                            for (int i = 0; i < dtLinkedVideos.Rows.Count; i++)
                            {
                                bool containsMatch = strAllFiles.Any(title => title.ToLower().Contains(dtLinkedVideos.Rows[i][3].ToString().ToLower()));
                                if (containsMatch == false)
                                {
                                    lstVideoLinks.Add(dtLinkedVideos.Rows[i][2].ToString() + ";" + dtLinkedVideos.Rows[i][3].ToString() + ";" + dtLinkedVideos.Rows[i][4].ToString() + ";" + dtLinkedVideos.Rows[i][6].ToString());
                                }
                            }

                            strAllFiles = strAllFiles.Concat(lstVideoLinks).ToArray();
                            strAllFiles = strAllFiles.OrderBy(entry =>
                            {
                                if (!entry.Contains(";http"))
                                {
                                    return System.IO.Path.GetFileName(entry);
                                }
                                else
                                {
                                    return entry.Split(';')[0];
                                }
                            }).ToArray();
                        }
                    }
                    bool hasVideos = false;
                    foreach (string file in strAllFiles)
                    {
                        intCountVideos++;
                        string strFilePath = file.Replace("\\", "/");
                        Regex datePrefixRegex = new Regex(@"^\d{4}\.\d{2}\.\d{2}\.", RegexOptions.IgnoreCase);
                        bool startsWithDatePrefix = datePrefixRegex.IsMatch(Path.GetFileName(strFilePath));
                        bool startsWithDateLinkedPrefix = datePrefixRegex.IsMatch(strFilePath);
                        
                        if (startsWithDateLinkedPrefix && isLinkedFolder)
                        {
                            hasVideos = true;
                            string[] strVideoData = file.Split(';');
                            string strVideoTitle = strVideoData[1].ToString();
                            if (strVideoTitle.Contains(" ["))
                            {
                                strVideoTitle = Regex.Replace(strVideoTitle, @" \[.*?\]", string.Empty);
                            }
                            string strExtraData = "", strDirector = strVideoData[3].ToString() != "" ? strVideoData[3].ToString() : strCurArtist;
                            if (strLinkVideoType == "Music Video")
                            {
                                string strURLDir = "https://en.wikipedia.org/wiki/" + strDirector;

                                try
                                {
                                    HttpWebRequest request = WebRequest.Create(strURLDir) as HttpWebRequest;
                                    request.Method = "HEAD";
                                    HttpWebResponse response = request.GetResponse() as HttpWebResponse;
                                    response.Close();
                                }
                                catch
                                {
                                    strURLDir = "https://www.google.com/search?q=" + strDirector.Replace(" ", "+") + "+producer";
                                }
                                strExtraData = " <a class='anchorTrack titleExtra coloredText' href='javascript:void(0)' style='color: aliceblue; font-size:10px; text-decoration:none'>(Directed by </a>" +
                                    "<a href='" + strURLDir + "' target='_blank' class='anchorProd coloredText' style='font-weight:bold;text-decoration:none; cursor:pointer; font-size:10px'>" + strDirector +
                                    "</a><a class='anchorTrack titleExtra coloredText' href='javascript:void(0)' style='color: aliceblue; font-size:10px; text-decoration:none'>)</a>";
                            }

                            string strVideoPath = strVideoData[2].ToString().ToLower().Contains("youtube") ? strVideoData[2].ToString().Replace("/watch?v=", "/embed/") + "?fs=1&autoplay=1" : strVideoData[2].ToString();
                            strContentTrack = strContentTrack + "<div class='row trackRow videoRow "+ strLinkVideoType.Replace(" ","") + "Row' data-webpath='" + strVideoPath + "' data-fullname='" + strVideoTitle.Replace("'", "%27") +
                                                "' data-feat='' data-tracktype='Video' data-cover='' data-other='' data-director='"+ strVideoData[3].ToString() + "' data-edition='' data-editionDate ='" + strVideoData[0].ToString() + "' data-performingArtist ='' data-disc='"+ strLinkVideoType + "' style='padding:10px; padding-right:15px; cursor:pointer'>" +
                                                "<div class='controlWrapper'><div class='col-1 controlTrack' style='display:none'><a class='anchorTrack' href='javascript:void(0)' style='color: aliceblue; text-decoration:none;'><i class='fa fa-play'></i></a></div>" +
                                                "<div class='col-1 numberTrack'><a class='anchorTrack' href='javascript:void(0)' style='color: aliceblue;text-decoration:none'>" + strVideoData[0].ToString() + "</a></div></div>" +
                                                "<div class='col-10'><a class='anchorTrack titleTrack' href='javascript:void(0)' style='color: aliceblue; text-decoration:none'>" + strVideoTitle + strExtraData + "</a></div>" +
                                                "<div class='col-1'><a class='anchorTrack lengthTrack' href='javascript:void(0)' style='color: aliceblue; text-decoration:none;'></a></div>" +
                                           "</div>";
                            continue;
                        }

                        string strFileName = strFilePath.ToLower().Contains("/video/") && startsWithDatePrefix ? Path.GetFileNameWithoutExtension(strFilePath).Substring(12) : Path.GetFileNameWithoutExtension(strFilePath).Substring(4);
                        string strFullName = Path.GetFileName(strFilePath);
                        string strWebPath = strFilePath.Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/", "http://127.0.0.1:8887/").Replace("\\", "/").Replace("'", "%27");
                        string strTrackNumber = strFilePath.ToLower().Contains("/video/") && startsWithDatePrefix ? Path.GetFileNameWithoutExtension(strFilePath).Substring(0,10) : strFilePath.ToLower().Contains("/video/") ? intCountVideos.ToString("D2") : isSingleSub == false ? strFullName.Substring(0, 2) : intCountBsides.ToString("D2");
                        string strPathWithNoFileName = strFilePath.Replace("/" + Path.GetFileName(strFilePath), "");
                        bool isDisc = strPathWithNoFileName.Contains(". Disc") ? true : false;
                        string strEditionName = isDisc == false ? Path.GetFileName(strPathWithNoFileName).Substring(12) : "";
                        string strEditionDate = isDisc == false ? Path.GetFileName(strPathWithNoFileName).Substring(0, 11) : "";
                        string strDiscName = "", strDiscFullName = "", strDiscNumber = "", strDiscHeader = "";
                        string strFileNameNoBrackets = strFileName, strBracketContent = "", strFeatures = "", strCovers = "", strOtherData = "";
                        string strTrackType = strItemType, strBsideClass = "", trackClass = "trackRow", strExtraClass = "";
                        string strTrackSingleContainer = "", strOriginalArtist = "";
                        if (isDisc == true && isBoxSet == false)
                        {
                            strPathWithNoFileName = strPathWithNoFileName.Replace("/" + Path.GetFileName(strFilePath), "");
                            strDiscName = Path.GetFileName(strPathWithNoFileName).Substring(4);
                            strDiscFullName = Path.GetFileName(strPathWithNoFileName);
                            strDiscNumber = Path.GetFileName(strPathWithNoFileName).Substring(0, 3);
                            if (strDiscName != strDiscNamePivot)
                            {
                                strDiscHeader = "<div class='editionRow' data-edition='" + Path.GetFileName(strPathWithNoFileName) + "' style='padding:5px; padding-left:5px; cursor:pointer'><a class='anchorTrack editionTrack coloredText' href='javascript:void(0)' style='text-decoration:none;cursor:default;font-weight: 600'>" + strDiscName + "</a></div>";
                            }
                            strPathWithNoFileName = strPathWithNoFileName.Replace("/" + Path.GetFileName(strPathWithNoFileName), "");
                            strEditionName = Path.GetFileName(strPathWithNoFileName).Substring(12);
                            strEditionDate = Path.GetFileName(strPathWithNoFileName).Substring(0, 11);
                        }

                        string strArtworkPath = strPathWithNoFileName + "/[Artwork]";
                        if (isSingleSub == true)
                        {
                            strTrackSingleContainer = strPathWithNoFileName.Split(new string[] { HttpContext.Current.Session["curReleaseName"].ToString() + "/"}, StringSplitOptions.None).LastOrDefault().Split('/').FirstOrDefault().Substring(12).Replace("'", "%27");
                            intCountBsides++;
                            strEditionName = "B-Sides";
                            strBsideClass = "bside_class";
                        }
                        if (isBoxSet || strItemType == "song")
                        {
                            strTrackNumber = intCountBoxSetTracks.ToString("D2");
                            strEditionName = lstBoxSetHeaders.Count > 0 ? lstBoxSetHeaders[intCountBoxSetIndex] : strEditionName;
                            intCountBoxSetIndex++;
                            intCountBoxSetTracks++;
                            isDisc = strItemType == "song" ? false : isDisc;
                        }
                        if (strEditionName != strEditionNamePivot && hasVideos == false)
                        {
                            strEditionNamePivot = strEditionName;
                            strHeader = "<div class='editionRow' data-edition='" + strEditionName + "' style='padding:5px; padding-left:5px; cursor:pointer'><a class='anchorTrack editionTrack coloredText' href='javascript:void(0)' style='text-decoration:none;cursor:default;font-weight: 900'>" + strEditionName + "</a></div>";
                            strContentTrack = strContentTrack + strHeader;
                            intCountBoxSetTracks = 1;
                            strTrackNumber = strFilePath.ToLower().Contains("/video/") && startsWithDatePrefix ? strTrackNumber : "01";
                            intCountBoxSetTracks++;

                        }
                        if (isDisc == true && strDiscName != strDiscNamePivot)
                        {
                            strDiscNamePivot = strDiscName;
                            strContentTrack = strContentTrack + strDiscHeader;
                        }

                        if (strFileName.Contains(" ["))
                        {
                            strFileNameNoBrackets = Regex.Replace(strFileName, @" \[.*?\]", string.Empty);
                            strBracketContent = strFileName.Replace(strFileNameNoBrackets + " [", "").Replace(", ", ",").Replace(" [", "").Replace("]", "");
                            string[] strTrackDetails = strBracketContent.Split(';');

                            foreach (string detail in strTrackDetails)
                            {
                                string strDetail = detail.Replace("'", "\'");
                                if (strDetail.ToLower().Contains("feat. "))
                                {
                                    strFeatures = strDetail;
                                }

                                else if (strDetail.Contains(" cover"))
                                {
                                    strCovers = strDetail;
                                    strFileName = strFileName.ToLower().Contains("; " + strCovers.ToLower()) ? strFileName.Replace("; " + strCovers, "") : strFileName.ToLower().Contains(strCovers.ToLower() + ";") ? strFileName.Replace(strCovers + ";", "") : strFileName.ToLower().Contains(strCovers) ? strFileName.Replace(strCovers, "") : strFileName;
                                }

                                else if (!strFeatures.ToLower().Contains(strDetail) && !strCovers.ToLower().Contains(strDetail))
                                {
                                    strOtherData = strDetail;
                                    if (strDetail.StartsWith("by " , StringComparison.OrdinalIgnoreCase) || strDetail.StartsWith(" by ", StringComparison.OrdinalIgnoreCase))
                                    {
                                        strOriginalArtist = strDetail.Replace(" by ", "").Replace("by ", "");
                                    }
                                }
                            }
                        }
                        string strDuration = "";
                        string strTrackProv = file;
                        if (strReleasePath.Contains("/Video/"))
                        {
                            strExtraClass = "videoRow";
                        }
                        if (strTrackProv.Contains(".lnk"))
                        {
                            string strLinkFilter = strOtherData == "Video" ? strFileNameNoBrackets + ".mp4" : strFullName;
                            strExtraClass = strOtherData == "Video" ? "videoRow" : "";
                            //trackClass = strOtherData != "Video" ? "trackRow" : "";
                            string[] alltracks = Directory.GetFiles(HttpContext.Current.Session["currentDisk"].ToString() + "/Music/" + HttpContext.Current.Session["curArtistInitial"]?.ToString() + "/" + strCurArtist, "*.*", SearchOption.AllDirectories).Where(x => x.Contains(strLinkFilter.Replace(".lnk", ".").Substring(4)) && !x.Contains(".lnk") && !x.Contains("[Artwork]")).ToArray();
                            //Check in other artists e.g. Various artists compilation
                            if (alltracks.Count() == 0)
                            {
                                alltracks = Directory.GetFiles(HttpContext.Current.Session["currentDisk"].ToString() + "/Music/", "*.*", SearchOption.AllDirectories).Where(x => x.Contains(strLinkFilter.Replace(".lnk", " [by " + strCurArtist).Substring(4)) && !x.Contains(".lnk") && !x.Contains("[Artwork]")).ToArray();
                            }
                            //Check in other artists other than Various Artists
                            if (alltracks.Count() == 0 && strOtherData.Contains("by "))
                            {
                                strLinkFilter = strLinkFilter.Replace(";" + strOtherData, "").Replace(" [" + strOtherData + "]", "");
                                alltracks = Directory.GetFiles(HttpContext.Current.Session["currentDisk"].ToString() + "/Music/", "*.*", SearchOption.AllDirectories).Where(x => x.Contains(strLinkFilter.Replace(".lnk", ".mp3").Substring(4)) && !x.Contains(".lnk") && !x.Contains("[Artwork]")).ToArray();
                            }
                            if (alltracks.Count() == 0)
                            {
                                continue;
                            }

                            Array.Sort(alltracks);
                            strTrackProv = alltracks.FirstOrDefault();
                            strWebPath = strTrackProv.Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/", "http://127.0.0.1:8887/").Replace("\\", "/").Replace("'", "%27");
                            strFullName = Path.GetFileName(strTrackProv);
                        }

                        if (!strTrackProv.Contains(".lnk") && !strTrackProv.Contains(".mp4"))
                        {
                            try
                            {
                                AudioFile ObjAF = new AudioFile(strTrackProv);
                                double dblDuration = ObjAF.Properties.Duration.TotalSeconds;
                                TimeSpan time = TimeSpan.FromSeconds(dblDuration);
                                strDuration = time.ToString(@"mm\:ss");
                            }
                            catch (Exception)
                            {
                            }
                            
                        }

                        string strSubBracketContent = "", strFileNameVid = strFileName;
                        if (strFileName.Contains("["))
                        {
                            strFileName = strFileName.Replace("[]", "").Replace("[", "(").Replace("]", ")");
                            int startExtra = strFileName.LastIndexOf(" (") + " (".Length;
                            int endExtra = strFileName.IndexOf(")", startExtra);
                            strFileNameNoBrackets = strFileName.Remove(startExtra, endExtra - startExtra).Replace(" ()", "");
                            strBracketContent = strFileName.Replace(strFileNameNoBrackets + " (", "").Replace(" (", "").Replace(")", "");
                            strBracketContent = !string.IsNullOrEmpty(strBracketContent) && (strBracketContent[0] == ' ' || strBracketContent[0] == '\t') ? strBracketContent.Substring(1) : strBracketContent;
                            strFileName = strFileNameNoBrackets + " <a class='anchorTrack titleExtra coloredText' href='javascript:void(0)' style='color: aliceblue; font-size:10px; text-decoration:none'>(" + strBracketContent.Replace(";", ",") + ", Previously Unreleased)</a>";
                            strSubBracketContent = !strBracketContent.Contains("feat.") && !strBracketContent.Contains(" cover") ? strBracketContent : "";
                        }

                        strFileName = !strWebPath.Contains(".lnk") && strTrackType.Contains("Compilation") && strSubBracketContent == "" ? strFileName.Replace("color: aliceblue;", "") : strFileName.Replace(" coloredText", "").Replace(", Previously Unreleased", "");
                        if (strTrackProv.Contains("/Compilations") && strWebPath.Contains(".lnk"))
                            strWebPath = strWebPath.Replace(".lnk", "");

                        if (!strWebPath.Contains(".lnk"))
                            intCountAudio++;

                        if (strDiscFullName != "" && !strWebPath.Contains(strDiscFullName) && strTrackType == "compilation")
                        {
                            strDiscFullName = strWebPath.Replace("/" + strFullName, "");
                            strDiscFullName = strDiscFullName.Substring(strDiscFullName.LastIndexOf('/') + 1);
                            strDiscFullName = strDiscFullName.Substring(4);
                        }

                        string strExtraVideoData = "", strVideoDirector = strCurArtist;
                        if (strLinkVideoType == "Music Video" && dtLinkedVideos?.Rows.Count > 0)
                        {
                            string strNewDirector = dtLinkedVideos.AsEnumerable().Where(row => row.Field<string>(3) == strFileNameVid)?.Select(row => row.Field<string>(6))?.FirstOrDefault()?.ToString();
                            if (strNewDirector != null)
                            {
                                strVideoDirector = strNewDirector.ToString() != "" ? strNewDirector : strVideoDirector;
                            }
                            
                            string strURLDir = "https://en.wikipedia.org/wiki/" + strVideoDirector;

                            try
                            {
                                HttpWebRequest request = WebRequest.Create(strURLDir) as HttpWebRequest;
                                request.Method = "HEAD";
                                HttpWebResponse response = request.GetResponse() as HttpWebResponse;
                                response.Close();
                            }
                            catch
                            {
                                strURLDir = "https://www.google.com/search?q=" + strVideoDirector.Replace(" ", "+") + "+producer";
                            }
                            strExtraVideoData = " <a class='anchorTrack titleExtra coloredText' href='javascript:void(0)' style='color: aliceblue; font-size:10px; text-decoration:none'>(Directed by </a>" +
                                "<a href='" + strURLDir + "' target='_blank' class='anchorProd coloredText' style='font-weight:bold;text-decoration:none; cursor:pointer; font-size:10px;'>" + strVideoDirector +
                                "</a><a class='anchorTrack titleExtra coloredText' href='javascript:void(0)' style='color: aliceblue; font-size:10px; text-decoration:none'>)</a>";
                        }

                        strContentTrack = strContentTrack + "<div class='row " + trackClass + " " + strExtraClass + " " + strBsideClass +"' data-singlecontainer='"+ strTrackSingleContainer + "' data-webpath='" + strWebPath + "' data-fullname='" + strFullName.Replace("'", "%27") + 
                                        "' data-feat='" + strFeatures.Replace("'", "%27") + "' data-tracktype='" + strTrackType.Replace("'", "%27") + "' data-cover='" + strCovers.Replace("'", "%27") + "' data-other='" + strOtherData.Replace("'", "%27") +
                                        "' data-edition='' data-editionDate ='' data-performingArtist ='" + strOriginalArtist+"' data-disc='" + strDiscFullName.Replace("'", "%27") + "' style='padding:10px; padding-right:15px; cursor:pointer'>" +
                                        "<div class='controlWrapper'><div class='col-1 controlTrack' style='display:none'><a class='anchorTrack' href='javascript:void(0)' style='color: aliceblue; text-decoration:none;'><i class='fa fa-play'></i></a></div>" +
                                        "<div class='col-1 numberTrack'><a class='anchorTrack' href='javascript:void(0)' style='color: aliceblue;text-decoration:none'>" + strTrackNumber + ".</a></div></div>" +
                                        "<div class='col-10'><a class='anchorTrack titleTrack' href='javascript:void(0)' style='color: aliceblue; text-decoration:none'>" + strFileName.Replace(" language version", " version") + "</a> "+ strExtraVideoData + "</div>" +
                                        "<div class='col-1'><a class='anchorTrack lengthTrack' href='javascript:void(0)' style='color: aliceblue; text-decoration:none;'>" + strDuration + "</a></div>" +
                                   "</div>";
                    }

                    if (intCountAudio == 0)
                    {
                        strContentTrack = strHeader != "" ? strContentTrack.Replace(strHeader, "") : strContentTrack;
                    }
                }
            }
            return strContentTrack;
        }

        public static List<string> LinkPath(string strOriginPath, string strCurrentArtist, string track, string strFullName, string strFileName, string strDuration, string strWebPath)
        {
            string strOriginalArtist = "";
            //If it's from an external artist
            if (strOriginPath.Contains("Taken from") && strOriginPath.Contains(",by "))
            {
                strOriginalArtist = strCurrentArtist;
                strOriginPath = strOriginPath.Replace(",by ", "Performed by ");
                strFileName = strFileName.Replace(";" + strOriginPath, "");
                track = track.Replace(";" + strOriginPath, "");
                strCurrentArtist = strOriginPath.Split(new string[] { "Performed by " }, StringSplitOptions.None)[1];
                strOriginPath = strOriginPath.Replace("Performed by " + strCurrentArtist, "");
            }

            char charInitialChar = strCurrentArtist.ToUpper()[0];
            charInitialChar = Char.IsDigit(charInitialChar) ? '#' : Char.IsSymbol(charInitialChar) ? '' : charInitialChar;

            string strOriginalPath = HttpContext.Current.Session["currentDisk"].ToString() + "/Music/" + charInitialChar + "/" + strCurrentArtist;
            string strContainingFolder = strOriginPath.Contains(" Single") ? "Single" : strOriginPath.Contains(" Compilation") ? "Compilation" : strOriginPath.Contains(" Live Album") ? "Live Album" : strOriginPath.Contains(" Extended Play") ? "Extended Play" : "Studio Album";
            string strEditionName = "";
            string strDiscName = "";

            string strLinkedTrackName = "";
            if (track.Split('/').Last().Split(';').Length - 1 > 1)
            {
                strLinkedTrackName = track.ToString().Split('\\').Last().Replace(strOriginPath, "").Replace(".lnk", "").Replace(" []", "").Substring(4).Replace(";]", "]");
            }
            else
            {
                strLinkedTrackName = track.ToString().Split('\\').Last().Replace(";", "").Replace(strOriginPath, "").Replace(".lnk", "").Replace(" []", "").Substring(4);
            }

            strOriginPath = strOriginPath.Replace(" " + strContainingFolder, "");
            strLinkedTrackName = strContainingFolder != "Studio Album" ? strLinkedTrackName.Replace(" " + strContainingFolder, "") : strLinkedTrackName;

            if (strOriginPath.Contains("("))
            {
                strEditionName = strOriginPath.Substring(strOriginPath.LastIndexOf(" (")).Replace(" (", "").Replace(")", "");
                strOriginPath = strOriginPath.Replace(strEditionName, "").Replace(" (", "").Replace(")", "");
                strLinkedTrackName = strLinkedTrackName.Replace(strEditionName, "").Replace(" (", "").Replace(")", "").Replace(strOriginPath, "");

                if (strEditionName.Contains(" - "))
                {
                    strDiscName = strEditionName.Substring(strEditionName.LastIndexOf(" - "));
                    strLinkedTrackName = strLinkedTrackName.Replace(strDiscName, "");
                }
            }

            strLinkedTrackName = strOriginalArtist != "" ? strLinkedTrackName.Replace("]", "Performed by " + strOriginalArtist + "]") : strLinkedTrackName;
            string[] strDir1 = Directory.GetDirectories(strOriginalPath); //Media Type
            Array.Sort(strDir1);
            int intFound = 0;
            foreach (var dir1 in strDir1)
            {
                string[] strDir2 = Directory.GetDirectories(dir1); //Release name
                Array.Sort(strDir2);
                if (dir1.ToString().Contains(strContainingFolder) && strDir2.Length > 0 && !strDir2[0].Contains("[Artwork]") && intFound == 0)
                {
                    foreach (var dir2 in strDir2)
                    {
                        if (strContainingFolder == "Single" && intFound == 0) //Singles
                        {
                            string[] strDir3 = Directory.GetDirectories(dir2);
                            Array.Sort(strDir3);
                            foreach (var dir3 in strDir3)
                            {
                                if (dir3.Contains(strOriginPath.Replace(" Taken from", "").Replace("Taken from", "")) && intFound == 0)
                                {
                                    string[] strDir4S = Directory.GetDirectories(dir3); //Edition name
                                    Array.Sort(strDir4S);
                                    if (strDir4S.Length > 1 && strDir4S[0].Contains("[Artwork]") && intFound == 0) //Discs
                                    {
                                        foreach (var dir4S in strDir4S)
                                        {
                                            if (!dir4S.Contains("[Artwork]"))
                                            {
                                                string[] strLinkTracks = Directory.GetFiles(dir4S);
                                                Array.Sort(strLinkTracks);
                                                foreach (var linktrack in strLinkTracks)
                                                {
                                                    string strExtension = "." + linktrack.Split('.').Last();
                                                    if (linktrack.Contains(strLinkedTrackName + strExtension) && intFound == 0)
                                                    {
                                                        strFullName = linktrack.ToString().Split('\\').Last();
                                                        strFileName = strFullName.Replace(strExtension, "").Substring(4);
                                                        AudioFile ObjAF = new AudioFile(linktrack);
                                                        double dblDuration = ObjAF.Properties.Duration.TotalSeconds;
                                                        TimeSpan time = TimeSpan.FromSeconds(dblDuration);
                                                        strDuration = time.ToString(@"mm\:ss");
                                                        strWebPath = linktrack.ToString().Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/", "http://127.0.0.1:8887/").Replace("\\", "/").Replace("'", "%27") + ".lnk";
                                                        intFound++;
                                                        break;
                                                    }
                                                }
                                            }
                                        }
                                    }

                                    else if (strDir4S.Length > 1 && intFound == 0) //Editions
                                    {

                                        foreach (var dir4S in strDir4S)
                                        {
                                            string[] strDir5 = Directory.GetDirectories(dir4S); //Edition name
                                            Array.Sort(strDir5);
                                            if (strDir5.Length > 1 && strDir5[0].Contains("[Artwork]") && intFound == 0) //Inside edition
                                            {
                                                string[] strLinkTracks = Directory.GetFiles(dir4S);
                                                Array.Sort(strLinkTracks);
                                                foreach (var linktrack in strLinkTracks)
                                                {
                                                    string strExtension = "." + linktrack.Split('.').Last();

                                                    if (linktrack.Contains(strLinkedTrackName + strExtension) && intFound == 0)
                                                    {
                                                        strFullName = linktrack.ToString().Split('\\').Last();
                                                        strFileName = strFullName.Replace(strExtension, "").Substring(4);
                                                        AudioFile ObjAF = new AudioFile(linktrack);
                                                        double dblDuration = ObjAF.Properties.Duration.TotalSeconds;
                                                        TimeSpan time = TimeSpan.FromSeconds(dblDuration);
                                                        strDuration = time.ToString(@"mm\:ss");
                                                        strWebPath = linktrack.ToString().Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/", "http://127.0.0.1:8887/").Replace("\\", "/").Replace("'", "%27") + ".lnk";
                                                        intFound++;
                                                        break;
                                                    }
                                                }
                                            }

                                            else if (intFound == 0) //No discs
                                            {
                                                string[] strLinkTracks = Directory.GetFiles(dir4S);
                                                Array.Sort(strLinkTracks);
                                                foreach (var linktrack in strLinkTracks)
                                                {
                                                    string strExtension = "." + linktrack.Split('.').Last();

                                                    if (linktrack.Contains(strLinkedTrackName + strExtension) && intFound == 0)
                                                    {
                                                        strFullName = linktrack.ToString().Split('\\').Last();
                                                        strFileName = strFullName.Replace(strExtension, "").Substring(4);
                                                        AudioFile ObjAF = new AudioFile(linktrack);
                                                        double dblDuration = ObjAF.Properties.Duration.TotalSeconds;
                                                        TimeSpan time = TimeSpan.FromSeconds(dblDuration);
                                                        strDuration = time.ToString(@"mm\:ss");
                                                        strWebPath = linktrack.ToString().Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/", "http://127.0.0.1:8887/").Replace("\\", "/").Replace("'", "%27") + ".lnk";
                                                        intFound++;
                                                        break;
                                                    }
                                                }
                                            }
                                        }
                                    }

                                    else if (intFound == 0) //No discs
                                    {
                                        string[] strLinkTracks = Directory.GetFiles(dir3);
                                        Array.Sort(strLinkTracks);
                                        foreach (var linktrack in strLinkTracks)
                                        {
                                            string strExtension = "." + linktrack.Split('.').Last();
                                            if (linktrack.Contains(strLinkedTrackName + strExtension) && intFound == 0)
                                            {
                                                strFullName = linktrack.ToString().Split('\\').Last();
                                                strFileName = strFullName.Replace(strExtension, "").Substring(4);
                                                AudioFile ObjAF = new AudioFile(linktrack);
                                                double dblDuration = ObjAF.Properties.Duration.TotalSeconds;
                                                TimeSpan time = TimeSpan.FromSeconds(dblDuration);
                                                strDuration = time.ToString(@"mm\:ss");
                                                strWebPath = linktrack.ToString().Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/", "http://127.0.0.1:8887/").Replace("\\", "/").Replace("'", "%27") + ".lnk";
                                                intFound++;
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        else if (dir2.Contains(strOriginPath.Replace(" Taken from", "").Replace("Taken from", "")) && intFound == 0)
                        {
                            string[] strDir3 = Directory.GetDirectories(dir2); //Edition name
                            Array.Sort(strDir3);
                            if (strDir3.Length > 1 && strDir3[0].Contains("[Artwork]") && intFound == 0) //Discs
                            {
                                foreach (var dir3 in strDir3)
                                {
                                    if (!dir3.Contains("[Artwork]"))
                                    {
                                        string[] strLinkTracks = Directory.GetFiles(dir3);
                                        Array.Sort(strLinkTracks);
                                        foreach (var linktrack in strLinkTracks)
                                        {
                                            string strExtension = "." + linktrack.Split('.').Last();
                                            if (linktrack.Contains(strLinkedTrackName + strExtension) && intFound == 0)
                                            {
                                                strFullName = linktrack.ToString().Split('\\').Last();
                                                strFileName = strFullName.Replace(strExtension, "").Substring(4);
                                                AudioFile ObjAF = new AudioFile(linktrack);
                                                double dblDuration = ObjAF.Properties.Duration.TotalSeconds;
                                                TimeSpan time = TimeSpan.FromSeconds(dblDuration);
                                                strDuration = time.ToString(@"mm\:ss");
                                                strWebPath = linktrack.ToString().Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/", "http://127.0.0.1:8887/").Replace("\\", "/").Replace("'", "%27") + ".lnk";
                                                intFound++;
                                                break;
                                            }
                                        }
                                    }
                                }
                            }

                            else if (strDir3.Length > 1 && intFound == 0) //Editions
                            {

                                foreach (var dir3 in strDir3)
                                {
                                    string[] strDir4 = Directory.GetDirectories(dir3); //Edition name
                                    Array.Sort(strDir4);
                                    if (strDir4.Length > 1 && strDir4[0].Contains("[Artwork]") && intFound == 0) //Discs
                                    {
                                        foreach (var dir4 in strDir4)
                                        {
                                            if (!dir4.Contains("[Artwork]"))
                                            {
                                                string[] strLinkTracks = Directory.GetFiles(dir4);
                                                Array.Sort(strLinkTracks);
                                                foreach (var linktrack in strLinkTracks)
                                                {
                                                    string strExtension = "." + linktrack.Split('.').Last();

                                                    if (linktrack.Contains(strLinkedTrackName + strExtension) && intFound == 0)
                                                    {
                                                        strFullName = linktrack.ToString().Split('\\').Last();
                                                        strFileName = strFullName.Replace(strExtension, "").Substring(4);
                                                        AudioFile ObjAF = new AudioFile(linktrack);
                                                        double dblDuration = ObjAF.Properties.Duration.TotalSeconds;
                                                        TimeSpan time = TimeSpan.FromSeconds(dblDuration);
                                                        strDuration = time.ToString(@"mm\:ss");
                                                        strWebPath = linktrack.ToString().Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/", "http://127.0.0.1:8887/").Replace("\\", "/").Replace("'", "%27") + ".lnk";
                                                        intFound++;
                                                        break;
                                                    }
                                                }
                                            }
                                        }
                                    }

                                    else if (intFound == 0) //No discs
                                    {
                                        string[] strLinkTracks = Directory.GetFiles(dir3);
                                        Array.Sort(strLinkTracks);
                                        foreach (var linktrack in strLinkTracks)
                                        {
                                            string strExtension = "." + linktrack.Split('.').Last();

                                            if (linktrack.Contains(strLinkedTrackName + strExtension) && intFound == 0)
                                            {
                                                strFullName = linktrack.ToString().Split('\\').Last();
                                                strFileName = strFullName.Replace(strExtension, "").Substring(4);
                                                AudioFile ObjAF = new AudioFile(linktrack);
                                                double dblDuration = ObjAF.Properties.Duration.TotalSeconds;
                                                TimeSpan time = TimeSpan.FromSeconds(dblDuration);
                                                strDuration = time.ToString(@"mm\:ss");
                                                strWebPath = linktrack.ToString().Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/", "http://127.0.0.1:8887/").Replace("\\", "/").Replace("'", "%27") + ".lnk";
                                                intFound++;
                                                break;
                                            }
                                        }
                                    }
                                }
                            }

                            else if (intFound == 0) //No discs
                            {
                                string[] strLinkTracks = Directory.GetFiles(dir2);
                                Array.Sort(strLinkTracks);
                                foreach (var linktrack in strLinkTracks)
                                {
                                    string strExtension = "." + linktrack.Split('.').Last();
                                    if (linktrack.Contains(strLinkedTrackName + strExtension) && intFound == 0)
                                    {
                                        strFullName = linktrack.ToString().Split('\\').Last();
                                        strFileName = strFullName.Replace(strExtension, "").Substring(4);
                                        AudioFile ObjAF = new AudioFile(linktrack);
                                        double dblDuration = ObjAF.Properties.Duration.TotalSeconds;
                                        TimeSpan time = TimeSpan.FromSeconds(dblDuration);
                                        strDuration = time.ToString(@"mm\:ss");
                                        strWebPath = linktrack.ToString().Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/", "http://127.0.0.1:8887/").Replace("\\", "/").Replace("'", "%27") + ".lnk";
                                        intFound++;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }

            List<string> lstVariables = new List<string>();

            if (strOriginalArtist != "")
            {
                strFullName = strFullName.Replace("Performed by " + strOriginalArtist, "");
                strFileName = strFileName.Replace("Performed by " + strOriginalArtist, "");
            }

            lstVariables.Add(strFullName);
            lstVariables.Add(strFileName);
            lstVariables.Add(strDuration);
            lstVariables.Add(strWebPath);

            return lstVariables;
        }

        public static string Wikipedia(string strType, string strPageName)
        {
            WebClient client = new WebClient();
            string strPage = "";
            using (Stream stream = client.OpenRead("http://en.wikipedia.org/w/api.php?format=json&action=query&prop=extracts&explaintext=1&titles=" + strPageName))
            using (StreamReader reader = new StreamReader(stream))
            {
                Newtonsoft.Json.JsonSerializer ser = new Newtonsoft.Json.JsonSerializer();
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

            strPage = strPage == "" && strPageName.Contains(", ") ? Wikipedia(strType, strPageName.Replace(", ", ": ")) : strPage;

            return strPage;
        }

        // Method to retrieve registered items and display them in datalist
        [System.Web.Services.WebMethod]
        public static string GetReleaseData(string strName = "", string strArtist = "", string strArtistID = "", string strProducer = "")
        {
            if (HttpContext.Current.Session["mediaType"].ToString() == "playlist")
            {
                return "_playlist_";
            }
            string strDate = HttpContext.Current.Session["curReleaseName"].ToString().Substring(0, 11);
            string strTitle = HttpContext.Current.Session["curReleaseName"].ToString().Substring(12);
            string strArtistInnerID = HttpContext.Current.Session["curArtistID"].ToString();
            string strWriterData = "";
            strArtistInnerID = strArtistInnerID.Replace(" ", "");

            DataTable dtReleaseData = ExtServices.GetRecordByThreeValues("releases", "relTitle", strTitle.Replace("'", "█").Replace(",", "■"), "relFKBands", strArtistInnerID, "relDate", strDate, "relDate", "ASC");

            string strCurProducer = dtReleaseData != null && dtReleaseData.Rows.Count > 0 ? dtReleaseData.Rows[0][10].ToString() : strProducer != "" ? strProducer : "";
            string strCurLabel = dtReleaseData != null && dtReleaseData.Rows.Count > 0 ? dtReleaseData.Rows[0][5].ToString() : "";
            string strCurGenres = dtReleaseData != null && dtReleaseData.Rows.Count > 0 ? dtReleaseData.Rows[0][6].ToString() : "";
            string strReleaseCode = "";
            string strData = "";
            strProducer = strProducer != strArtist ? strProducer : "";

            if (dtReleaseData == null || (strCurProducer == "" || strCurLabel == "" || strCurGenres == ""))
            {
                //Get code from MusicBrainz
                MusicBrainzClient client = new MusicBrainzClient();
                Task<string> taskId = Task.Run(() => Search(client, strName, strArtist, strArtistID, strProducer, dtReleaseData, strDate, strArtistInnerID));
                taskId.Wait();
                strData = taskId.Result.Split('■')[0];
                HttpContext.Current.Session["curReleaseID"] = taskId.Result.Split('■')[1];

                //Insert writers for songs
                char charInitialChar = HttpContext.Current.Session["curArtistName"].ToString().ToUpper()[0];
                charInitialChar = Char.IsDigit(charInitialChar) ? '#' : Char.IsSymbol(charInitialChar) ? '' : charInitialChar;
                int intCountTracks = 0;

                string strArtistName = HttpContext.Current.Session["curArtistName"].ToString();

                string strAllReleaseCredits = "";
                DataTable dtArtistReleases = ExtServices.GetRecordByValue("releases", "relFKbands", strArtistInnerID);

                if (dtArtistReleases != null && dtArtistReleases.Rows.Count > 0)
                {
                    for (int i = 0; i < dtArtistReleases.Rows.Count; i++)
                    {
                        if (dtArtistReleases.Rows[i][13].ToString() != "")
                        {
                            strAllReleaseCredits = strAllReleaseCredits == "" ? dtArtistReleases.Rows[i][13].ToString() : strAllReleaseCredits + "■" + dtArtistReleases.Rows[i][13].ToString();
                        }
                    }
                }


                string[] dirs = Directory.GetDirectories(HttpContext.Current.Session["currentDisk"].ToString() + "/Music/" + charInitialChar + "/" + strArtistName, HttpContext.Current.Session["curReleaseName"].ToString(), SearchOption.AllDirectories);
                Array.Sort(dirs);
                if (dirs != null && dirs.Length > 0)
                {
                    foreach (string dir in dirs)
                    {
                        string[] alltracks = Directory.GetFiles(dir, "*.mp3", SearchOption.AllDirectories);
                        Array.Sort(alltracks);
                        string[] alllinks = Directory.GetFiles(dir, "*.lnk", SearchOption.AllDirectories);
                        Array.Sort(alllinks);
                        string[] allfiles = alltracks.Union(alllinks).ToArray();

                        //features and covers
                        string strFeatures = GetReleaseFeatures(alltracks);
                        string strCovers = GetReleaseCovers(alltracks);

                        if (allfiles != null && allfiles.Length > 0)
                        {
                            string strCurrentTracklist = "";
                            foreach (string track in allfiles)
                            {
                                if (track.Contains(".mp3") || (track.Contains(".lnk") && !track.Contains(" [Video]")))
                                {
                                    string strTrackName = Path.GetFileNameWithoutExtension(track).Substring(4).Replace("  ", " ");
                                    string strTrackNameNoBrackets = strTrackName;
                                    string strBracketContent = strTrackName;
                                    if (strTrackNameNoBrackets.Contains(" ["))
                                    {

                                        int index = strTrackNameNoBrackets.IndexOf(" [");
                                        if (index >= 0)
                                            strTrackNameNoBrackets = strTrackNameNoBrackets.Substring(0, index);
                                        strBracketContent = strTrackName.Replace(strTrackNameNoBrackets, "").Replace(" [", "").Replace("[", "").Replace("]", "");
                                    }
                                    //Prevent duplicates
                                    if (!strCurrentTracklist.Contains(strTrackNameNoBrackets + ","))
                                    {
                                        //Look if it's already registered on other releases
                                        if (strAllReleaseCredits != "" && strAllReleaseCredits.ToLower().Contains("~" + strTrackNameNoBrackets.ToLower().Replace("'", "▀").Replace(",", "■") + "~["))
                                        {
                                            string[] strArrCredits = strAllReleaseCredits.ToLower().Split(new string[] { "~" + strTrackNameNoBrackets.ToLower().Replace("'", "▀").Replace(",", "■") + "~" }, StringSplitOptions.None);
                                            string[] strNewArrCredits = strArrCredits[1].Split('■');
                                            string strNewWriter = System.Globalization.CultureInfo.CurrentCulture.TextInfo.ToTitleCase(strNewArrCredits[0].ToString().ToLower());
                                            string strCurrentCredits = "~" + strTrackNameNoBrackets.Replace("'", "▀").Replace(",", "■") + "~" + strNewWriter.Replace("_Not_Found", "_not_found");
                                            strWriterData = strWriterData == "" ? strCurrentCredits.Replace("'", "▀").Replace(",", "■") : strWriterData + "■" + strCurrentCredits.Replace("'", "▀").Replace(",", "■");
                                            strCurrentTracklist = strCurrentTracklist + strTrackNameNoBrackets + ",";
                                        }
                                        //Get from MBDB
                                        else if (!strWriterData.ToLower().Contains("~" + strTrackNameNoBrackets.ToLower().Replace("'", "█").Replace(",", "■") + "~["))
                                        {
                                            intCountTracks++;
                                            if (intCountTracks != 0 && intCountTracks % 4 == 0)
                                            {
                                                Thread.Sleep(2000);
                                            }
                                            MusicBrainzClient client2 = new MusicBrainzClient();
                                            Boolean boolCover = false;
                                            string newArtistName = strArtistName;
                                            if (strBracketContent.Contains(" cover"))
                                            {
                                                boolCover = true;
                                                foreach (string strIndex in strBracketContent.Split(';'))
                                                {
                                                    if (strIndex.Contains("cover"))
                                                    {
                                                        newArtistName = strIndex.Replace(" cover", "");
                                                    }
                                                }
                                            }
                                            strArtistID = HttpContext.Current.Session["curArtistID"].ToString();
                                            Task<string> taskWriter = Task.Run(() => GetRecordingData(client2, newArtistName, strTitle, strTrackNameNoBrackets, strArtistID, strDate, "", true, boolCover));
                                            taskWriter.Wait();
                                            string strResponse = taskWriter.Result;
                                            strWriterData = strWriterData == "" ? strResponse.Replace("'", "▀").Replace(",", "■") : strWriterData + "■" + strResponse.Replace("'", "▀").Replace(",", "■");
                                            strCurrentTracklist = strCurrentTracklist + strTrackNameNoBrackets + ",";
                                        }
                                    }
                                }
                            }

                            //writing writers in database
                            if (strWriterData != "")
                            {
                                string strCommaRepl = "■";
                                DataTable dtReleaseDataWriters = ExtServices.GetRecordByThreeValues("releases", "relTitle", strTitle.Replace("'", "▀").Replace(",", "■"), "relFKBands", strArtistInnerID, "relDate", strDate, "relDate", "ASC");
                                if (dtReleaseDataWriters != null && dtReleaseDataWriters.Rows.Count > 0 && dtReleaseDataWriters.Rows[0][13].ToString() != strWriterData)
                                {
                                    List<string> lstCol = new List<string>();
                                    List<string> lstVal = new List<string>();

                                    lstCol.Add("relFKwriters");
                                    lstVal.Add(strWriterData);
                                    if (strFeatures != "")
                                    {
                                        lstCol.Add("relFKfeatures");
                                        lstVal.Add(strFeatures);
                                        if (strFeatures.Contains(","))
                                        {
                                            strCommaRepl = "#";
                                        }
                                    }
                                    if (strCovers != "")
                                    {
                                        lstCol.Add("relFKcovers");
                                        lstVal.Add(strCovers);
                                    }

                                    ExtServices.UpdateByRecordID("releases", lstCol, lstVal, "relID", Convert.ToInt32(dtReleaseDataWriters.Rows[0][0].ToString()),"",0, strCommaRepl);
                                }
                                else
                                {
                                    dtReleaseDataWriters = ExtServices.GetRecordByTwoValues("releases", "relTitle", strTitle.Replace("'", "▀").Replace(",", "■"), "relFKBands", strArtistID, "relDate", "ASC");
                                    if (dtReleaseDataWriters != null && dtReleaseDataWriters.Rows.Count > 0 && dtReleaseDataWriters.Rows[0][13].ToString() != strWriterData)
                                    {
                                        List<string> lstCol = new List<string>();
                                        List<string> lstVal = new List<string>();

                                        lstCol.Add("relFKwriters");
                                        lstVal.Add(strWriterData);
                                        if (strFeatures != "")
                                        {
                                            lstCol.Add("relFKfeatures");
                                            lstVal.Add(strFeatures);
                                        }
                                        if (strCovers != "")
                                        {
                                            lstCol.Add("relFKcovers");
                                            lstVal.Add(strCovers);
                                        }
                                        ExtServices.UpdateByRecordID("releases", lstCol, lstVal, "relID", Convert.ToInt32(dtReleaseDataWriters.Rows[0][0].ToString()));
                                    }
                                }
                            }
                        }
                    }
                }
            }

            else
            {
                string strHTMLProd = "";
                strReleaseCode = strReleaseCode == "" && dtReleaseData != null && dtReleaseData.Rows.Count > 0 && dtReleaseData.Rows[0][12].ToString() != "" ? dtReleaseData.Rows[0][12].ToString() : strReleaseCode;
                foreach (string prodName in strCurProducer.Split(','))
                {
                    DataTable dtArtistName = ExtServices.GetRecordByValue("artists", "artID", prodName);
                    string prodName2 = dtArtistName != null && dtArtistName.Rows.Count > 0 ? dtArtistName.Rows[0][3].ToString() : prodName;
                    string strURL = "https://en.wikipedia.org/wiki/" + prodName2;
                    string strSeparator = ", ";
                    if (prodName == strCurProducer.Split(',').Last())
                        strSeparator = " and ";

                    try
                    {
                        HttpWebRequest request = WebRequest.Create(strURL) as HttpWebRequest;
                        request.Method = "HEAD";
                        HttpWebResponse response = request.GetResponse() as HttpWebResponse;
                        response.Close();
                    }
                    catch
                    {
                        strURL = "https://www.google.com/search?q=" + strProducer.Replace(" ", "+") + "+producer";
                    }
                    strHTMLProd = strHTMLProd == "" ? "<p class='pSpaAlbum' style='display: table;margin: 0 auto;margin-bottom:2px'><a class='aSpaAlbum pSpaLabel' style='text-decoration: none; padding-right: 6px'>Produced  by </a>" + "<a href='" + strURL + "' target='_blank' class='anchorProd coloredText' style='font-weight:bold;text-decoration:none; cursor:pointer'>" + prodName2 + "</a>" : strHTMLProd + "<a href='javascript:void(0)' class='aSpaAlbum pSpaLabel' style='text-decoration:none;padding-left:6px;padding-right:6px; color:inherit'>" + strSeparator + "</a>" +
                                "<a href='" + strURL + "' target='_blank' class='anchorProd coloredText' style='font-weight:bold; text-decoration:none;cursor:pointer'>" + prodName2 + "</a>";
                }

                strData = strReleaseCode + "^" + strCurGenres + "^" + strCurLabel + "^" + strHTMLProd + "^" + strWriterData;
            }
            return strData;
        }

        private static string GetReleaseCovers(string[] alltracks)
        {
            string[] allCovers = alltracks.Where(x => x.Contains("[") && x.Contains(" cover]")).ToArray();
            string strCovers = "";
            foreach (string cover in allCovers)
            {
                string strTrackTitleCv = Path.GetFileNameWithoutExtension(cover).Substring(4).Replace("  ", " ");
                string strArtistCv = strTrackTitleCv.Contains(";") ? strTrackTitleCv.Split(new string[] { " cover]" }, StringSplitOptions.None)[0].Split('[')[1].Split(';')[1] : strTrackTitleCv.Split(new string[] { " cover]" }, StringSplitOptions.None)[0].Split('[')[1];
                var startsWithWhiteSpaceCv = char.IsWhiteSpace(strArtistCv, 0);
                if (startsWithWhiteSpaceCv)
                {
                    strArtistCv = strArtistCv.Substring(1);
                }
                strTrackTitleCv = strTrackTitleCv.Split(new string[] { " [" }, StringSplitOptions.None)[0];
                if (!strCovers.Contains(strTrackTitleCv))
                {
                    DataTable dtPersonDataCv = ExtServices.GetRecordByValue("bands", "bndName", strArtistCv);
                    string strArtistCvId = dtPersonDataCv != null && dtPersonDataCv.Rows.Count > 0 ? dtPersonDataCv.Rows[0][0].ToString() + "_bnd" : strArtistCv + "_not_found";
                    strCovers = strCovers == "" ? "~" + strTrackTitleCv + "~[{" + strArtistCvId + "}]" : strCovers + "■~" + strTrackTitleCv + "~[{" + strArtistCvId + "}]";
                }
            }
            return strCovers;
        }

        private static string GetReleaseFeatures(string[] alltracks)
        {
            string[] allFeatures = alltracks.Where(x => x.Contains("[") && x.Contains("feat. ")).ToArray();
            string strFeatures = "";
            
            foreach (string feature in allFeatures)
            {
                string strTrackFeatures = "";
                string strTrackTitleFt = Path.GetFileNameWithoutExtension(feature).Substring(4).Replace("  ", " ");
                string strArtistFt = strTrackTitleFt.Split(new string[] { "feat. " }, StringSplitOptions.None)[1];
                strTrackTitleFt = strTrackTitleFt.Split(new string[] { " [" }, StringSplitOptions.None)[0];
                if (!strFeatures.Contains(strTrackTitleFt))
                {
                    //Look for artist by name
                    strArtistFt = strArtistFt.Replace(" cover]", "").Replace("; ", ";");
                    string[] strArtistFtArray = strArtistFt.Replace(", ", ";").Replace(" & ", ";").Replace(" and ", ";").Split(';').Select(s => s.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();

                    foreach (string artist in strArtistFtArray)
                    {
                        if (!artist.Contains(" cover") && !artist.Contains("by "))
                        {
                            string strCurArtistFt = artist;
                            var startsWithWhiteSpaceCv = char.IsWhiteSpace(strCurArtistFt, 0);
                            if (startsWithWhiteSpaceCv)
                            {
                                strCurArtistFt = strCurArtistFt.Substring(1);
                            }
                            DataTable dtPersonDataFt = ExtServices.GetRecordByValue("bands", "bndName", strCurArtistFt);
                            if (dtPersonDataFt == null)
                            {
                                dtPersonDataFt = ExtServices.GetRecordLikeValue("bands", "bndOtherNames", strCurArtistFt);
                            }
                            string strArtistFtId = dtPersonDataFt != null && dtPersonDataFt.Rows.Count > 0 ? dtPersonDataFt.Rows[0][0].ToString() + "_bnd" : strCurArtistFt + "_not_found";
                            strTrackFeatures = strTrackFeatures == "" ? "{" + strArtistFtId + "}" : strTrackFeatures + ";{" + strArtistFtId + "}";
                        }
                    }
                    strTrackFeatures = strTrackFeatures + "]";
                    strFeatures = strFeatures == "" ? "~" + strTrackTitleFt + "~" + strTrackFeatures : strFeatures + "■~" + strTrackTitleFt + "~" + strTrackFeatures;
                }
            }
            return strFeatures;
        }

        public static async Task<string> Search(MusicBrainzClient client, string strRelease, string strArtistName, string strArtistID, string strProducer, DataTable dtReleaseData, string strRelDate, string strArtistInnerID)
        {
            string strData = "";
            string strGenres = "";
            string strProducersList = "";
            strArtistInnerID = strArtistInnerID.Replace(" ", "");
            string strGlobHTMLProd = "";
            Boolean boolProdBand = false;

            List<string> lstCol = new List<string>();
            List<string> lstVal = new List<string>();

            List<string> lstGenres = new List<string>();
            DataTable dtGenres = ExtServices.GetContentByTableName("genres");
            if (dtGenres != null && dtGenres.Rows.Count > 0)
            {
                for (int i = 0; i < dtGenres.Rows.Count; i++)
                {
                    lstGenres.Add(dtGenres.Rows[i][1].ToString());
                }
            }
            var query = new QueryParameters<Release>()
            {
            { "arid", strArtistID },
            { "release", strRelease }
            };


            string strCurProducer = dtReleaseData != null && dtReleaseData.Rows.Count > 0 ? dtReleaseData.Rows[0][10].ToString() : strProducer != "" ? strProducer : "";
            string strCurLabel = dtReleaseData != null && dtReleaseData.Rows.Count > 0 ? dtReleaseData.Rows[0][5].ToString() : "";
            string strCurGenres = dtReleaseData != null && dtReleaseData.Rows.Count > 0 ? dtReleaseData.Rows[0][6].ToString() : "";
            string strReleaseCode = "";
            strProducer = strProducer != strArtistName ? strProducer : "";

            if (dtReleaseData == null || (strCurProducer == "" || strCurLabel == "" || strCurGenres == ""))
            {
                var varReleases = await client.Releases.SearchAsync(query);

                if (varReleases.Items.Count > 0)
                {
                    var varRelease = varReleases.Items.First();
                    varRelease = await client.Releases.GetAsync(varRelease.Id, "aliases", "recordings", "release-groups", "tags", "genres", "url-rels", "area-rels", "artist-rels", "instrument-rels", "work-rels", "recording-rels", "release-group-rels", "labels");
                    var varArtist = await client.Releases.GetAsync(varRelease.Id, "release-rels", "artist-credits");
                    //string strProd = varArtist.Relations[27].Artist.Id;
                    //Get producers

                    if (strProducer == "")
                    {
                        var queryRel = new QueryParameters<Recording>() { { "arid", strArtistID }, { "reid", varRelease.Id } };
                        var varRecordings = await client.Recordings.SearchAsync(queryRel);
                        int intCountReqs = 0;

                        foreach (var recording in varRecordings)
                        {
                            //var varRecordingDetails = await client.Recordings.GetAsync(recording.Id, "artist-rels");
                            var varRecordingDetails = await client.Recordings.GetAsync(recording.Id, "artist-rels");
                            if (intCountReqs < 8)
                            {
                                foreach (var producer in varRecordingDetails.Relations.Where(r => r.Type == "producer"))
                                {
                                    if (producer.Artist.Name != null && !strProducer.Contains(producer.Artist.Name))
                                    {
                                        strProducer = strProducer == "" ? producer.Artist.Name : strProducer + "/ " + producer.Artist.Name;
                                    }
                                }
                                intCountReqs++;
                            }
                            else
                            {
                                break;
                            }

                        }

                    }

                    //Get Genres
                    if (dtReleaseData == null || (dtReleaseData != null && dtReleaseData.Rows[0][6].ToString() == ""))
                    {
                        TextInfo textInfo = new CultureInfo("en-US", false).TextInfo;

                        foreach (var genre in varRelease.ReleaseGroup.Genres)
                        {
                            //var varRecording = await client.Recordings.GetAsync(relation.Id, "recording-rels","work-rels","url-rels","recording-rels","artist-rels","release-rels");
                            if (!lstGenres.Contains(textInfo.ToTitleCase(genre.Name)))
                            {
                                strGenres = strGenres == "" ? textInfo.ToTitleCase(genre.Name) : strGenres + "⠀•⠀" + textInfo.ToTitleCase(genre.Name);
                            }
                        }


                        if (strGenres != "" && strCurGenres == "")
                        {
                            lstCol.Add("relFKsubgenres");
                            lstVal.Add(strGenres.Replace("⠀•⠀", ";"));
                            strCurGenres = strGenres;
                        }

                    }

                    string strReleaseId = varRelease.Id != null ? varRelease.Id : "";
                    string strReleaseLabel = varRelease.Labels.Count > 0 && varRelease.Labels[0].Label != null ? varRelease.Labels[0].Label.Name : "";
                    strCurLabel = strReleaseLabel != "" ? strReleaseLabel : "Self-released record";

                    strProducer = strProducer == "" ? strArtistName : strProducer;
                    string strHTMLProd = "";
                    int intHasAnd = 0;

                    if (strProducer.Contains("⠀• "))
                    {
                        intHasAnd++;
                        strProducer = strProducer.Replace("⠀• ", "/");
                    }

                    if (strProducer.Contains("/"))
                    {
                        string[] strProd = strProducer.Split('/');
                        string strProducerNames = "";
                        foreach (var name in strProd)
                        {
                            string strCurrentName = name.Substring(0, 1) == " " ? name.Substring(1) : name;
                            if (strCurrentName != strArtistName)
                            {
                                //Look for the producer in artists, register if it doesn't exist, then get ID
                                DataTable dtArtists = ExtServices.GetRecordByValueList("artists", "artStageName", strCurrentName, "artID");
                                if (dtArtists == null || dtArtists.Rows.Count == 0)
                                {
                                    //Look for it on MB, regisgter it
                                    MusicBrainzClient client3 = new MusicBrainzClient();
                                    Task<string> taskId = Task.Run(() => PrimaryPage.GetItemId(client3, strCurrentName));
                                    taskId.Wait();
                                    string strArtCode = taskId.Result;
                                    List<string> lstCol2 = new List<string>();
                                    List<string> lstVal2 = new List<string>();

                                    if (strArtCode != "")
                                    {
                                        MusicBrainzClient client2 = new MusicBrainzClient();
                                        Task<Artist> tsArtist = Task.Run(() => PrimaryPage.ValidateItemId(client2, strArtCode, "artist"));
                                        tsArtist.Wait();
                                        if (tsArtist.Result != null)
                                        {
                                            lstCol2.Add("artCode");
                                            lstCol2.Add("artName");
                                            lstCol2.Add("artStageName");
                                            lstCol2.Add("artAliases");
                                            lstCol2.Add("artFKoccupations");


                                            string strAliases = "";
                                            string strLegalName = "";
                                            if (tsArtist.Result.Aliases != null)
                                            {
                                                foreach (var alias in tsArtist.Result.Aliases)
                                                {
                                                    if (alias.Type == "Legal name")
                                                    {
                                                        strLegalName = alias.Name.ToString(); //Name
                                                    }
                                                    else if (alias.Name != strCurrentName)
                                                    {
                                                        strAliases = strAliases == "" ? alias.Name.ToString() : strAliases + ";" + alias.Name.ToString();
                                                    }
                                                }
                                            }

                                            strLegalName = strLegalName != "" ? strLegalName : tsArtist.Result.Name;

                                            lstVal2.Add(strArtCode);
                                            lstVal2.Add(strLegalName);
                                            lstVal2.Add(strCurrentName);
                                            lstVal2.Add(strAliases);
                                            lstVal2.Add("1");

                                            ExtServices.InsertByTableName("artists", lstCol2, lstVal2);

                                        }
                                    }

                                    else
                                    {
                                        lstCol2.Add("artName");
                                        lstCol2.Add("artStageName");
                                        lstCol2.Add("artFKoccupations");

                                        lstVal2.Add(strCurrentName);
                                        lstVal2.Add(strCurrentName);
                                        lstVal2.Add("1");

                                        ExtServices.InsertByTableName("artists", lstCol2, lstVal2);
                                    }

                                }


                                strProducerNames = strProducerNames == "" ? strCurrentName : strProducerNames + ";" + strCurrentName;
                                string strURL = "https://en.wikipedia.org/wiki/" + strCurrentName;

                                try
                                {
                                    HttpWebRequest request = WebRequest.Create(strURL) as HttpWebRequest;
                                    request.Method = "HEAD";
                                    HttpWebResponse response = request.GetResponse() as HttpWebResponse;
                                    response.Close();
                                }
                                catch
                                {
                                    strURL = "https://www.google.com/search?q=" + strCurrentName.Replace(" ", "+") + "+producer";
                                }

                                strHTMLProd = strHTMLProd == "" ? "<p class='pSpaAlbum' style='display: table;margin: 0 auto;margin-bottom:2px;text-align:center'><a class='aSpaAlbum pSpaLabel' style='text-decoration: none; padding-right: 6px'>Produced  by </a>" + "<a href='" + strURL + "' target='_blank' class='anchorProd coloredText' style='font-weight:bold;text-decoration:none; cursor:pointer'>" + strCurrentName + "</a>" : strHTMLProd + "<a href='javascript:void(0)' class='aSpaAlbum pSpaLabel' style='text-decoration:none;padding-right:6px; color:inherit'>, </a>" +
                                    "<a href='" + strURL + "' target='_blank' class='anchorProd coloredText' style='font-weight:bold; text-decoration:none;cursor:pointer'>" + strCurrentName + "</a>";
                            }
                        }

                        int place = strHTMLProd.LastIndexOf(", ");
                        strHTMLProd = place >= 0 ? strHTMLProd.Remove(place, ", ".Length).Insert(place, " and ") : strHTMLProd;
                        int place2 = strHTMLProd.LastIndexOf("padding-right:6px; color:inherit");
                        strHTMLProd = place2 >= 0 ? strHTMLProd.Remove(place2, "padding-right:6px; color:inherit".Length).Insert(place2, "padding-right:6px;padding-left:6px; color:inherit") : strHTMLProd;

                        strProducersList = strProducerNames;
                    }

                    else
                    {
                        string strURL = "https://en.wikipedia.org/wiki/" + strProducer;
                        if (strCurProducer == "")
                        {
                            strProducersList = strProducer;
                        }

                        try
                        {
                            HttpWebRequest request = WebRequest.Create(strURL) as HttpWebRequest;
                            request.Method = "HEAD";
                            HttpWebResponse response = request.GetResponse() as HttpWebResponse;
                            response.Close();
                        }
                        catch
                        {
                            strURL = "https://www.google.com/search?q=" + strProducer.Replace(" ", "+") + "+producer";
                        }

                        strHTMLProd = "<p class='pSpaAlbum' style='display: table;margin: 0 auto;margin-bottom:2px'><a class='aSpaAlbum pSpaLabel' style='text-decoration: none; padding-right: 6px'>Produced  by </a>" + "<a href='" + strURL + "' target='_blank' class='anchorProd coloredText' style='font-weight:bold;text-decoration:none;cursor:pointer'>" + strProducer + "</a>";
                    }

                    if (intHasAnd > 0)
                    {
                        int place = strHTMLProd.LastIndexOf(",");
                        if (place > 0)
                        {
                            strHTMLProd = strHTMLProd.Remove(place, ",".Length).Insert(place, " and") + "</p>";
                        }
                        else
                        {
                            strHTMLProd = strHTMLProd + "</p>";
                        }
                    }

                    if (strGenres == "")
                    {
                        DataTable dtBand = ExtServices.GetRecordByValue("bands", "bndCode", strArtistID);
                        if (dtBand.Rows[0][10].ToString() != "")
                        {
                            string[] strGenresArt = dtBand.Rows[0][10].ToString().Split(';');
                            int intCountItem = 0;

                            foreach (string genre in strGenresArt)
                            {
                                DataTable dtSubgenre = ExtServices.GetRecordByValue("subgenres", " sgnID", genre);
                                if (dtSubgenre != null && dtSubgenre.Rows.Count > 0)
                                {
                                    strGenres = strGenres == "" ? dtSubgenre.Rows[0][1].ToString() : strGenres + "⠀•⠀" + dtSubgenre.Rows[0][1].ToString();
                                    intCountItem++;
                                }
                            }

                            if (dtReleaseData == null || strCurGenres == "")
                            {
                                lstCol.Add("relFKsubgenres");
                                lstVal.Add(strGenres.Replace("⠀•⠀", ";"));
                                strCurGenres = strGenres;
                            }
                        }
                    }

                    strData = strReleaseId + "^" + strGenres + "^" + strReleaseLabel + "^" + strHTMLProd;
                    strReleaseCode = strReleaseId;
                    strGlobHTMLProd = strHTMLProd;

                    // Lyric are represented as artist-url relationships.
                    //var lyrics = artist.Relations.Where(r => r.TargetType == "url" && r.Type == "lyrics");
                }

                else
                {
                    if (strProducer == "")
                    {
                        DataTable dtReleaseProducerData = ExtServices.GetRecordByValue("releases", "relFKbands", strArtistInnerID);
                        int intCountProds = 0;
                        if (dtReleaseProducerData != null && dtReleaseProducerData.Rows.Count > 0)
                        {
                            for (int i = 0; i < dtReleaseProducerData.Rows.Count; i++)
                            {
                                if ((Convert.ToInt32(dtReleaseProducerData.Rows[i][4].ToString().Substring(0, 4)) == Convert.ToInt32(strRelDate.Substring(0, 4)) - 1) || (Convert.ToInt32(dtReleaseProducerData.Rows[i][4].ToString().Substring(0, 4)) == Convert.ToInt32(strRelDate.Substring(0, 4)) + 1))
                                {
                                    string[] strProducerIDList = dtReleaseProducerData.Rows[i][10].ToString().Split(';');
                                    foreach (string prodID in strProducerIDList)
                                    {
                                        DataTable dtArtists = ExtServices.GetRecordByValue("artists", "artID", prodID);
                                        DataTable dtCurrentBand = ExtServices.GetRecordByValue("bands", "bndID", prodID);

                                        if (dtArtists != null && dtArtists.Rows.Count > 0 && dtArtists.Rows[0][3].ToString() != "")
                                        {
                                            string strProducerWriteName = dtArtists.Rows[0][3].ToString();
                                            if (dtCurrentBand != null && dtCurrentBand.Rows.Count > 0 && strProducerWriteName.ToLower() != dtCurrentBand.Rows[0][1].ToString().ToLower())
                                            {
                                                boolProdBand = true;
                                                strProducerWriteName = dtCurrentBand.Rows[0][1].ToString();
                                            }

                                            strProducer = strProducer == "" ? strProducerWriteName : strProducer + "/" + strProducerWriteName;
                                            intCountProds++;
                                        }
                                    }

                                    if (intCountProds > 0)
                                    {
                                        break;
                                    }
                                }
                            }
                        }
                    }

                    string strHTMLProd = "";
                    int intHasAnd = 0;
                    string strProducerList = "";

                    if (strProducer.Contains("⠀• "))
                    {
                        intHasAnd++;
                        strProducer = strProducer.Replace("⠀• ", "/");
                    }

                    if (strProducer.Contains("/"))
                    {
                        string[] strProd = strProducer.Split('/');
                        foreach (var name in strProd)
                        {
                            string strURL = "https://en.wikipedia.org/wiki/" + name;

                            try
                            {
                                HttpWebRequest request = WebRequest.Create(strURL) as HttpWebRequest;
                                request.Method = "HEAD";
                                HttpWebResponse response = request.GetResponse() as HttpWebResponse;
                                response.Close();
                            }
                            catch
                            {
                                strURL = "https://www.google.com/search?q=" + name.Replace(" ", "+") + "+producer";
                            }

                            strHTMLProd = strHTMLProd == "" ? "<p class='pSpaAlbum' style='display: table;margin: 0 auto;margin-bottom:2px'><a class='aSpaAlbum pSpaLabel' style='text-decoration: none; padding-right: 6px'>Produced  by </a>" + "<a href='" + strURL + "' target='_blank' class='anchorProd coloredText' style='font-weight:bold;text-decoration:none; cursor:pointer'>" + name + "</a>" : strHTMLProd + "<a href='javascript:void(0)' class='aSpaAlbum pSpaLabel' style='text-decoration:none;padding-left:6px;padding-right:6px; color:inherit'>, </a>" +
                                "<a href='" + strURL + "' target='_blank' class='anchorProd coloredText' style='font-weight:bold; text-decoration:none;cursor:pointer'>" + name + "</a>";

                            strProducerList = strProducerList == "" ? name : strProducerList + ", " + name;
                        }

                        if (dtReleaseData == null || strCurProducer == "")
                        {
                            strProducersList = strProducerList;
                        }
                    }

                    else
                    {
                        string strURL = "https://en.wikipedia.org/wiki/" + strProducer;

                        try
                        {
                            HttpWebRequest request = WebRequest.Create(strURL) as HttpWebRequest;
                            request.Method = "HEAD";
                            HttpWebResponse response = request.GetResponse() as HttpWebResponse;
                            response.Close();
                        }
                        catch
                        {
                            strURL = "https://www.google.com/search?q=" + strProducer.Replace(" ", "+") + "+producer";
                        }

                        strHTMLProd = "<p class='pSpaAlbum' style='display: table;margin: 0 auto;margin-bottom:2px'><a class='aSpaAlbum pSpaLabel' style='text-decoration: none; padding-right: 6px'>Produced  by </a>" + "<a href='" + strURL + "' target='_blank' class='anchorProd coloredText' style='font-weight:bold;text-decoration:none;cursor:pointer'>" + strProducer + "</a>";
                    }

                    if (intHasAnd > 0)
                    {
                        int place = strHTMLProd.LastIndexOf(",");
                        strHTMLProd = strHTMLProd.Remove(place, ",".Length).Insert(place, " and") + "</p>";
                    }

                    if (strGenres == "")
                    {
                        DataTable dtBand = ExtServices.GetRecordByValue("bands", "bndCode", strArtistID);
                        if (dtBand.Rows[0][10].ToString() != "")
                        {
                            string[] strGenresArt = dtBand.Rows[0][10].ToString().Split(';');
                            int intCountItem = 0;

                            foreach (string genre in strGenresArt)
                            {
                                DataTable dtSubgenre = ExtServices.GetRecordByValue("subgenres", " sgnID", genre);
                                if (dtSubgenre != null && dtSubgenre.Rows.Count > 0)
                                {
                                    strGenres = strGenres == "" ? dtSubgenre.Rows[0][1].ToString() : strGenres + "⠀•⠀" + dtSubgenre.Rows[0][1].ToString();
                                    intCountItem++;
                                }
                            }

                            if (dtReleaseData == null || strCurGenres == "")
                            {
                                lstCol.Add("relFKsubgenres");
                                lstVal.Add(strGenres.Replace("⠀•⠀", ";"));
                                strCurGenres = strGenres;
                            }

                        }
                    }

                    strData = "^" + strGenres + "^" + "^" + strHTMLProd;
                    strGlobHTMLProd = strHTMLProd;
                }

                //register release
                if (dtReleaseData == null || dtReleaseData.Rows.Count == 0)
                {
                    strProducersList = strProducersList != "" ? strProducersList : strProducer != "" ? strProducer : "";
                    DataTable dtPersonData = ExtServices.GetRecordByValue("releases", "relFKbands", strArtistInnerID);

                    if (strProducersList == "" || (strProducersList == strArtistName && strCurLabel != "Self-released record"))
                    {

                        if (dtPersonData != null && dtPersonData.Rows.Count > 0)
                        {
                            for (int i = 0; i < dtPersonData.Rows.Count; i++)
                            {
                                if (dtPersonData.Rows[i][4].ToString().Substring(0, 4) == strRelDate.Substring(0, 4))
                                {
                                    string strProducerID = dtPersonData.Rows[i][10].ToString();

                                    DataTable dtArtists = ExtServices.GetRecordByValue("artists", "artID", strProducerID);
                                    if (dtArtists != null && dtArtists.Rows.Count > 0)
                                    {
                                        strProducersList = dtArtists.Rows[0][3].ToString() != "" ? dtArtists.Rows[0][3].ToString() : dtArtists.Rows[0][2].ToString();
                                        break;
                                    }
                                }
                            }
                        }
                    }

                    if (strProducersList == "" || (strProducersList == strArtistName && strCurLabel != "Self-released record"))
                    {
                        if (dtPersonData != null && dtPersonData.Rows.Count > 0)
                        {
                            for (int i = 0; i < dtPersonData.Rows.Count; i++)
                            {
                                if ((Convert.ToInt32(dtPersonData.Rows[i][4].ToString().Substring(0, 4)) == Convert.ToInt32(strRelDate.Substring(0, 4)) - 1) || (Convert.ToInt32(dtPersonData.Rows[i][4].ToString().Substring(0, 4)) == Convert.ToInt32(strRelDate.Substring(0, 4)) + 1))
                                {
                                    string strProducerID = dtPersonData.Rows[i][10].ToString();

                                    DataTable dtArtists = ExtServices.GetRecordByValue("artists", "artID", strProducerID);
                                    if (dtArtists != null && dtArtists.Rows.Count > 0)
                                    {
                                        strProducersList = dtArtists.Rows[0][3].ToString() != "" ? dtArtists.Rows[0][3].ToString() : dtArtists.Rows[0][2].ToString();
                                        break;
                                    }
                                }
                            }
                        }
                    }

                    if (strProducersList == "" || (strProducersList == strArtistName && strCurLabel != "Self-released record"))
                    {
                        if (dtPersonData != null && dtPersonData.Rows.Count > 0)
                        {
                            for (int i = 0; i < dtPersonData.Rows.Count; i++)
                            {
                                if (dtPersonData.Rows[0][10].ToString() != "")
                                {
                                    string strProducerID = dtPersonData.Rows[i][10].ToString();

                                    DataTable dtArtists = ExtServices.GetRecordByValue("artists", "artID", strProducerID);
                                    if (dtArtists != null && dtArtists.Rows.Count > 0)
                                    {
                                        strProducersList = dtArtists.Rows[0][3].ToString() != "" ? dtArtists.Rows[0][3].ToString() : dtArtists.Rows[0][2].ToString();
                                        break;
                                    }
                                }
                            }
                        }
                    }

                    if (strProducersList == "" || (strProducersList == strArtistName && strCurLabel != "Self-released record"))
                    {
                        strProducersList = strArtistName;
                    }

                    if (strProducersList != "")
                    {
                        string[] strProdArray = strProducersList.Split(';');
                        string strProducersID = "";

                        foreach (string prod in strProdArray)
                        {
                            //Look for prod in artists by stagename
                            DataTable dtArtists = ExtServices.GetRecordByValueList("artists", "artStageName", prod, "artID");
                            if (dtArtists != null && dtArtists.Rows.Count > 0 && strCurLabel != "Self-released record")
                            {
                                strProducersID = strProducersID == "" ? dtArtists.Rows[0][0].ToString() : strProducersID + ";" + dtArtists.Rows[0][0].ToString();
                            }

                            else if (dtArtists != null && dtArtists.Rows.Count > 0 && strCurLabel == "Self-released record")
                            {
                                if (dtArtists.Rows[0][0].ToString() != strArtistInnerID)
                                {
                                    strProducersID = strProducersID == "" ? dtArtists.Rows[0][0].ToString() : strProducersID + ";" + dtArtists.Rows[0][0].ToString();
                                }
                            }

                            else if (strCurLabel == "Self-released record")
                            {
                                strProducersID = strProducersID == "" ? strArtistInnerID + "_bnd" : strProducersID + ";" + strArtistInnerID + "_bnd";
                            }
                        }

                        if (strProducersID != "")
                        {
                            lstCol.Add("relFKartists");
                            lstVal.Add(strProducersID);
                        }
                        else
                        {
                            lstCol.Add("relFKartists");
                            lstVal.Add(strArtistInnerID + "_bnd");
                        }

                        //Get record label from releases table if empty
                        if (strCurLabel == "" && dtPersonData != null && dtPersonData.Rows.Count > 0)
                        {
                            for (int i = 0; i < dtPersonData.Rows.Count; i++)
                            {
                                if ((Convert.ToInt32(dtPersonData.Rows[i][4].ToString().Substring(0, 4)) == Convert.ToInt32(strRelDate.Substring(0, 4)) - 1) || (Convert.ToInt32(dtPersonData.Rows[i][4].ToString().Substring(0, 4)) == Convert.ToInt32(strRelDate.Substring(0, 4)) + 1))
                                {
                                    strCurLabel = dtPersonData.Rows[i][5].ToString() != "" ? dtPersonData.Rows[i][5].ToString() : "Self-released record";
                                }
                            }
                        }

                        strCurLabel = strCurLabel != "" ? strCurLabel : "Self-released record";

                        if (strCurLabel != "")
                        {
                            lstCol.Add("relFKcompanies");
                            lstVal.Add(strCurLabel.Replace("\'", "▀"));
                        }

                        strRelDate = strRelDate != "" ? strRelDate : "";

                        lstCol.Add("relTitle");
                        lstVal.Add(strRelease.Replace("\'", "▀"));
                        lstCol.Add("relFKbands");
                        lstVal.Add(strArtistInnerID);
                        lstCol.Add("relDate");
                        lstVal.Add(strRelDate);
                        lstCol.Add("relReleaseCode");
                        lstVal.Add(strReleaseCode);

                        ExtServices.InsertByTableName("releases", lstCol, lstVal);

                        //Get release ID and update session variable
                        DataTable dtNewReleaseData = ExtServices.GetRecordByThreeValues("releases", "relTitle", strRelease.Replace("'", "█").Replace(",", "■"), "relFKBands", strArtistInnerID, "relDate", strRelDate, "relDate", "ASC");
                        string strNewReleaseID = dtNewReleaseData != null && dtNewReleaseData.Rows.Count > 0 && dtNewReleaseData.Rows[0][0].ToString() != "" ? dtNewReleaseData.Rows[0][0].ToString() : "";

                        strData = strReleaseCode + "^" + strGenres + "^" + strCurLabel + "^" + strGlobHTMLProd + "■" + strNewReleaseID;
                    }

                }
            }

            //Values exist in database
            else
            {
                string strHTMLProd = "";

                //Release code

                strReleaseCode = strReleaseCode == "" && dtReleaseData != null && dtReleaseData.Rows.Count > 0 && dtReleaseData.Rows[0][12].ToString() != "" ? dtReleaseData.Rows[0][12].ToString() : strReleaseCode;


                //Retrieve producer name from artists table


                foreach (string prodName in strCurProducer.Split(','))
                {
                    DataTable dtArtistName = ExtServices.GetRecordByValue("artists", "artID", prodName);
                    string prodName2 = dtArtistName != null && dtArtistName.Rows.Count > 0 ? dtArtistName.Rows[0][3].ToString() : prodName;
                    string strURL = "https://en.wikipedia.org/wiki/" + prodName2;

                    string strSeparator = ", ";

                    if (prodName == strCurProducer.Split(',').Last())
                    {
                        strSeparator = " and ";
                    }

                    try
                    {
                        HttpWebRequest request = WebRequest.Create(strURL) as HttpWebRequest;
                        request.Method = "HEAD";
                        HttpWebResponse response = request.GetResponse() as HttpWebResponse;
                        response.Close();
                    }
                    catch
                    {
                        strURL = "https://www.google.com/search?q=" + strProducer.Replace(" ", "+") + "+producer";
                    }

                    strHTMLProd = strHTMLProd == "" ? "<p class='pSpaAlbum' style='display: table;margin: 0 auto;margin-bottom:2px'><a class='aSpaAlbum pSpaLabel' style='text-decoration: none; padding-right: 6px'>Produced  by </a>" + "<a href='" + strURL + "' target='_blank' class='anchorProd coloredText' style='font-weight:bold;text-decoration:none; cursor:pointer'>" + prodName2 + "</a>" : strHTMLProd + "<a href='javascript:void(0)' class='aSpaAlbum pSpaLabel' style='text-decoration:none;padding-left:6px;padding-right:6px; color:inherit'>" + strSeparator + "</a>" +
                                "<a href='" + strURL + "' target='_blank' class='anchorProd coloredText' style='font-weight:bold; text-decoration:none;cursor:pointer'>" + prodName2 + "</a>";
                }

                strData = strReleaseCode + "^" + strCurGenres + "^" + strCurLabel + "^" + strHTMLProd;
            }

            if (!strData.Contains("■"))
            {
                //Get release ID and update session variable
                DataTable dtNewReleaseData = ExtServices.GetRecordByThreeValues("releases", "relTitle", strRelease.Replace("'", "█").Replace(",", "■"), "relFKBands", strArtistInnerID, "relDate", strRelDate, "relDate", "ASC");
                string strNewReleaseID = dtNewReleaseData != null && dtNewReleaseData.Rows.Count > 0 && dtNewReleaseData.Rows[0][0].ToString() != "" ? dtNewReleaseData.Rows[0][0].ToString() : "";

                strData = strData + "■" + strNewReleaseID;
            }

            return strData;
        }

        [System.Web.Services.WebMethod]
        public static async Task<string> GetRecordingData(MusicBrainzClient client, string artist, string album, string song, string artist_id, string release_date, string credits, Boolean booRelease = false, Boolean booCover = false)
        {
            string strWriters = "", strNewCredits = "";

            // Build an advanced query to search for the recording.
            var query = new QueryParameters<Recording>()
            {
                { "artist", artist },
                { "release", album },
                { "recording", song }
            };

            if (booCover == true)
            {
                query = new QueryParameters<Recording>()
            {
                { "artist", artist },
                { "recording", song }
            };
            }

            // Search for a recording by title
            Thread.Sleep(1500);
            var recordings = await client.Recordings.SearchAsync(query);
            string strRecordingID = recordings.Count > 0 ? recordings.First().Id : "";
            if (strRecordingID != "")
            {
                string strURL = "https://musicbrainz.org/ws/2/recording/" + strRecordingID + "?inc=work-level-rels+work-rels+artist-rels";
                using (WebClient wc = new WebClient())
                {
                    HttpWebRequest request = (HttpWebRequest)WebRequest.Create(strURL);
                    request.UserAgent = "MediaBinger";
                    HttpWebResponse response = (HttpWebResponse)request.GetResponse();
                    XDocument doc = XDocument.Load(response.GetResponseStream());

                    IEnumerable<XElement> childList =
                        from el in doc.Elements()
                        select el;

                    foreach (XElement e in childList)
                    {
                        string strContents = e.ToString().Replace("\"", "'");
                        int intDuplicate = 0;

                        string strKey = strContents.Contains("'composer'") ? "'composer'" : strContents.Contains("'lyricist'") ? "'lyricist'" : strContents.Contains("'writer'") ? "'writer'" : "";
                        if (strKey != "")
                        {
                            string[] strArray = strContents.Split(new string[] { strKey }, StringSplitOptions.None);
                            foreach (string item in strArray)
                            {
                                if (item.Contains("<name>") && item.Contains("</name>"))
                                {
                                    int pFrom = item.IndexOf("<name>") + "<name>".Length;
                                    int pTo = item.IndexOf("</name>");

                                    string result = item.Substring(pFrom, pTo - pFrom);

                                    //Fetch id with name/alias
                                    DataTable dtPersonData = ExtServices.GetRecordByValue("artists", "artStageName", result);
                                    if (dtPersonData != null && dtPersonData.Rows.Count > 0)
                                    {
                                        if (strWriters.Contains("{" + dtPersonData.Rows[0][0].ToString() + "}"))
                                        {
                                            intDuplicate = 1;
                                        }
                                        else
                                        {
                                            intDuplicate = 0;
                                            strWriters = strWriters == "" ? "{" + dtPersonData.Rows[0][0].ToString() + "}" : strWriters + ";" + "{" + dtPersonData.Rows[0][0].ToString() + "}";
                                        }

                                    }

                                    else
                                    {
                                        dtPersonData = ExtServices.GetRecordByValue("artists", "artName", result);
                                        if (dtPersonData != null && dtPersonData.Rows.Count > 0)
                                        {
                                            if (strWriters.Contains("{" + dtPersonData.Rows[0][0].ToString() + "}"))
                                            {
                                                intDuplicate = 1;
                                            }
                                            else
                                            {
                                                intDuplicate = 0;
                                                strWriters = strWriters == "" ? "{" + dtPersonData.Rows[0][0].ToString() + "}" : strWriters + ";" + "{" + dtPersonData.Rows[0][0].ToString() + "}";
                                            }
                                        }

                                        else
                                        {
                                            dtPersonData = ExtServices.GetRecordByValue("bands", "bndName", result);

                                            if (dtPersonData != null && dtPersonData.Rows.Count > 0 && intDuplicate == 1)
                                            {
                                                if (strWriters.Contains("{" + dtPersonData.Rows[0][0].ToString() + "}"))
                                                {
                                                    intDuplicate = 1;
                                                }
                                                else
                                                {
                                                    intDuplicate = 0;
                                                    strWriters = strWriters == "" ? "{" + dtPersonData.Rows[0][0].ToString() + "_bnd}" : strWriters + ";" + "{" + dtPersonData.Rows[0][0].ToString() + "_bnd}";
                                                }

                                            }
                                            else if (intDuplicate == 0)
                                            {
                                                strWriters = strWriters == "" ? "{" + result.Replace("'", "█").Replace(",", "■") + "_not_found}" : strWriters + ";" + "{" + result.Replace("'", "█").Replace(",", "■") + "_not_found}";
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        //If no writer is found then get vocalist of current lineup
                        if (strWriters == "")
                        {
                            DataTable dtParticipations = ExtServices.GetRecordByValue("artistparticipations", "arpFKbands", artist_id, "arpStartDates");
                            string strVocalist = "";

                            if (dtParticipations != null && dtParticipations.Rows.Count > 0)
                            {
                                for (int i = 0; i < dtParticipations.Rows.Count; i++)
                                {
                                    //Finding vocalist
                                    if (dtParticipations.Rows[i][6].ToString() != "" && dtParticipations.Rows[i][6].ToString().Contains("1016"))
                                    {
                                        //If participation didn't end
                                        if (dtParticipations.Rows[i][4].ToString() == "" && (dtParticipations.Rows[i][3].ToString() != ""))
                                        {
                                            strVocalist = Convert.ToInt32(release_date.Substring(0, 4)) > Convert.ToInt32(dtParticipations.Rows[i][3].ToString()) ? dtParticipations.Rows[i][2].ToString() : "";
                                            if (strVocalist != "")
                                            {
                                                break;
                                            }
                                        }
                                        // If participation ended
                                        if (dtParticipations.Rows[i][4].ToString() != "" && (dtParticipations.Rows[i][3].ToString() != "") && strVocalist == "")
                                        {
                                            strVocalist = Convert.ToInt32(release_date.Substring(0, 4)) > Convert.ToInt32(dtParticipations.Rows[i][3].ToString()) && Convert.ToInt32(release_date.Substring(0, 4)) < Convert.ToInt32(dtParticipations.Rows[i][4].ToString()) ? dtParticipations.Rows[i][2].ToString() : "";
                                            if (strVocalist != "")
                                            {
                                                break;
                                            };
                                        }
                                    }
                                }
                                if (strVocalist == "")
                                {
                                    strVocalist = dtParticipations.Rows[0][2].ToString();
                                }
                                strWriters = "{" + strVocalist + "}";

                                strNewCredits = credits == "" ? "~" + song + "~[" + strWriters + "]" : credits + "■~" + song + "~[" + strWriters + "]";

                                //Update release field in database
                                DataTable dtReleaseData = ExtServices.GetRecordByThreeValues("releases", "relTitle", album.Replace("'", "█").Replace(",", "■"), "relFKBands", artist_id, "relDate", release_date, "relDate", "ASC");
                                if (dtReleaseData != null && dtReleaseData.Rows.Count > 0 && booRelease == false)
                                {
                                    List<string> lstCol = new List<string>();
                                    List<string> lstVal = new List<string>();

                                    lstCol.Add("relFKwriters");
                                    lstVal.Add(strNewCredits);
                                    ExtServices.UpdateByRecordID("releases", lstCol, lstVal, "relID", Convert.ToInt32(dtReleaseData.Rows[0][0].ToString()));
                                }
                                else
                                {
                                    dtReleaseData = ExtServices.GetRecordByTwoValues("releases", "relTitle", album.Replace("'", "█").Replace(",", "■"), "relFKBands", artist_id, "relDate", "ASC");
                                    if (dtReleaseData != null && dtReleaseData.Rows.Count > 0 && booRelease == false)
                                    {
                                        List<string> lstCol = new List<string>();
                                        List<string> lstVal = new List<string>();

                                        lstCol.Add("relFKwriters");
                                        lstVal.Add(strNewCredits);
                                        ExtServices.UpdateByRecordID("releases", lstCol, lstVal, "relID", Convert.ToInt32(dtReleaseData.Rows[0][0].ToString()));
                                    }
                                }
                            }
                        }
                        //Update field in database
                        else
                        {
                            strNewCredits = credits == "" ? "~" + song + "~[" + strWriters + "]" : credits + "■~" + song + "~[" + strWriters + "]";

                            //Update release field in database
                            DataTable dtReleaseData = ExtServices.GetRecordByThreeValues("releases", "relTitle", album.Replace("'", "█").Replace(",", "■"), "relFKBands", artist_id, "relDate", release_date, "relDate", "ASC");
                            if (dtReleaseData != null && dtReleaseData.Rows.Count > 0 && booRelease == false)
                            {
                                List<string> lstCol = new List<string>();
                                List<string> lstVal = new List<string>();

                                lstCol.Add("relFKwriters");
                                lstVal.Add(strNewCredits);
                                ExtServices.UpdateByRecordID("releases", lstCol, lstVal, "relID", Convert.ToInt32(dtReleaseData.Rows[0][0].ToString()));
                            }
                        }
                    }
                }
            }
            //No writer found at all
            else
            {
                if (strWriters == "")
                {
                    //Get by artist name
                    DataTable dtArtistLookup = ExtServices.GetRecordByValue("artists", "artStageName", artist);
                    if (dtArtistLookup == null)
                    {
                        strWriters = "{" + artist + "_not_found}";
                        strNewCredits = credits == "" ? "~" + song + "~[" + strWriters + "]" : credits + "■~" + song + "~[" + strWriters + "]";
                        //Update release field in database
                        DataTable dtReleaseData = ExtServices.GetRecordByThreeValues("releases", "relTitle", album.Replace("'", "█").Replace(",", "■"), "relFKBands", artist_id, "relDate", release_date, "relDate", "ASC");
                        if (dtReleaseData != null && dtReleaseData.Rows.Count > 0)
                        {
                            List<string> lstCol = new List<string>();
                            List<string> lstVal = new List<string>();

                            lstCol.Add("relFKwriters");
                            lstVal.Add(strNewCredits.Replace("{ ","{"));
                            ExtServices.UpdateByRecordID("releases", lstCol, lstVal, "relID", Convert.ToInt32(dtReleaseData.Rows[0][0].ToString()));
                        }
                    }
                    else
                    {
                        DataTable dtParticipations = ExtServices.GetRecordByValue("artistparticipations", "arpFKbands", artist_id, "arpStartDates");
                        string strVocalist = "";

                        if (dtParticipations != null && dtParticipations.Rows.Count > 0)
                        {
                            for (int i = 0; i < dtParticipations.Rows.Count; i++)
                            {
                                //Finding vocalist
                                if (dtParticipations.Rows[i][6].ToString() != "" && dtParticipations.Rows[i][6].ToString().Contains("1016"))
                                {
                                    //If participation didn't end
                                    if (dtParticipations.Rows[i][4].ToString() == "" && (dtParticipations.Rows[i][3].ToString() != ""))
                                    {
                                        if (dtParticipations.Rows[i][3].ToString().Contains("-"))
                                        {
                                            strVocalist = Convert.ToInt32(release_date.Substring(0, 4)) > Convert.ToInt32(dtParticipations.Rows[i][3].ToString().Substring(0, 4)) ? dtParticipations.Rows[i][2].ToString() : "";
                                        }
                                        else
                                        {
                                            strVocalist = Convert.ToInt32(release_date.Substring(0, 4)) > Convert.ToInt32(dtParticipations.Rows[i][3].ToString()) ? dtParticipations.Rows[i][2].ToString() : "";
                                        }

                                        
                                        if (strVocalist != "")
                                        {
                                            break;
                                        }
                                    }
                                    // If participation ended
                                    if (dtParticipations.Rows[i][4].ToString() != "" && (dtParticipations.Rows[i][3].ToString() != "") && strVocalist == "")
                                    {
                                        strVocalist = Convert.ToInt32(release_date.Substring(0, 4)) > Convert.ToInt32(dtParticipations.Rows[i][3].ToString()) && Convert.ToInt32(release_date.Substring(0, 4)) < Convert.ToInt32(dtParticipations.Rows[i][4].ToString()) ? dtParticipations.Rows[i][2].ToString() : "";
                                        if (strVocalist != "")
                                        {
                                            break;
                                        };
                                    }
                                }
                            }
                            if (strVocalist == "")
                            {
                                strVocalist = dtParticipations.Rows[0][2].ToString();
                            }
                            strWriters = "{" + strVocalist + "}";

                            strNewCredits = credits == "" ? "~" + song + "~[" + strWriters + "]" : credits + "■~" + song + "~[" + strWriters + "]";

                            //Update release field in database
                            DataTable dtReleaseData = ExtServices.GetRecordByThreeValues("releases", "relTitle", album.Replace("'", "█").Replace(",", "■"), "relFKBands", artist_id, "relDate", release_date, "relDate", "ASC");
                            if (dtReleaseData != null && dtReleaseData.Rows.Count > 0 && booRelease == false)
                            {
                                List<string> lstCol = new List<string>();
                                List<string> lstVal = new List<string>();

                                lstCol.Add("relFKwriters");
                                lstVal.Add(strNewCredits);
                                ExtServices.UpdateByRecordID("releases", lstCol, lstVal, "relID", Convert.ToInt32(dtReleaseData.Rows[0][0].ToString()));
                            }
                        }
                    }                    
                }
                //Update field in database
                else
                {
                    strNewCredits = credits == "" ? "~" + song + "~[" + strWriters + "]" : credits + "■~" + song + "~[" + strWriters + "]";

                    //Update release field in database
                    DataTable dtReleaseData = ExtServices.GetRecordByThreeValues("releases", "relTitle", album.Replace("'", "█").Replace(",", "■"), "relFKBands", artist_id, "relDate", release_date, "relDate", "ASC");
                    if (dtReleaseData != null && dtReleaseData.Rows.Count > 0 && booRelease == false)
                    {
                        List<string> lstCol = new List<string>();
                        List<string> lstVal = new List<string>();

                        lstCol.Add("relFKwriters");
                        lstVal.Add(strNewCredits);
                        ExtServices.UpdateByRecordID("releases", lstCol, lstVal, "relID", Convert.ToInt32(dtReleaseData.Rows[0][0].ToString()));
                    }
                }
            }
            return booRelease == false ? strWriters + "¡" + strNewCredits : strNewCredits;
        }

        //UPdate writers
        [System.Web.Services.WebMethod]
        public static string UpdateTrackWriters(string strTrackTitle, string strTrackWriters)
        {
            strTrackTitle = strTrackTitle.Replace("</span>", "").Replace("<span>", "").Replace("  ", " ");
            if (strTrackTitle.Contains(" <span"))
            {
                int index = strTrackTitle.IndexOf(" <span");
                if (index >= 0)
                    strTrackTitle = strTrackTitle.Substring(0, index);
            }
            string strData = "";
            string strNewIDs = "";
            strTrackWriters = strTrackWriters.Replace("; ", ";");
            string strWriters = "";
            //Get current release's writers
            string strArtistID = HttpContext.Current.Session["curArtistID"].ToString();
            string strReleaseDate = HttpContext.Current.Session["curReleaseDate"].ToString();
            string strReleaseTitle = HttpContext.Current.Session["curReleaseName"].ToString().Substring(12);
            DataTable dtReleaseData = ExtServices.GetRecordByThreeValues("releases", "relTitle", strReleaseTitle.Replace("'", "█").Replace(",", "■"), "relFKBands", strArtistID, "relDate", strReleaseDate, "relDate", "ASC");
            if (dtReleaseData == null)
            {
                dtReleaseData = ExtServices.GetRecordByTwoValues("releases", "relTitle", strReleaseTitle.Replace("'", "█").Replace(",", "■"), "relFKBands", strArtistID, "relDate", "ASC");
            }
            //Get IDs of new writers
            if (strTrackWriters != "")
            {
                string[] arrWriters = strTrackWriters.Split(';');

                foreach (string strName in arrWriters)
                {
                    //Fetch id with name/alias
                    DataTable dtPersonData = ExtServices.GetRecordByValue("artists", "artStageName", strName);
                    if (dtPersonData != null && dtPersonData.Rows.Count > 0)
                    {
                        strNewIDs = strNewIDs == "" ? "{" + dtPersonData.Rows[0][0].ToString() + "}" : strNewIDs + ";" + "{" + dtPersonData.Rows[0][0].ToString() + "}";
                    }

                    else
                    {
                        dtPersonData = ExtServices.GetRecordByValue("artists", "artName", strName);
                        if (dtPersonData != null && dtPersonData.Rows.Count > 0)
                        {
                            strNewIDs = strNewIDs == "" ? "{" + dtPersonData.Rows[0][0].ToString() + "}" : strNewIDs + ";" + "{" + dtPersonData.Rows[0][0].ToString() + "}";
                        }

                        else
                        {
                            strNewIDs = strNewIDs == "" ? "{" + strName.Replace("'", "█").Replace(",", "■") + "_not_found}" : strNewIDs + ";" + "{" + strName.Replace("'", "█").Replace(",", "■") + "_not_found}";
                        }
                    }
                }
            }

            string strToReplace = "";
            List<string> lstCol = new List<string>();
            List<string> lstVal = new List<string>();
            //Loop through each one to find the matching track
            if (dtReleaseData != null && dtReleaseData.Rows.Count > 0)
            {
                //If writers exist
                if (dtReleaseData.Rows[0][13].ToString() != "")
                {
                    strWriters = dtReleaseData.Rows[0][13].ToString();
                    string[] arrTracks = strWriters.Split('■');

                    foreach (string strTrack in arrTracks)
                    {
                        if (strTrack.Contains("~" + strTrackTitle + "~"))
                        {
                            strToReplace = strTrack.Replace(strTrack.Split('[')[1], strNewIDs + "]");
                            strWriters = strWriters.Replace(strTrack, strToReplace);
                            break;
                        }
                    }
                    //Update track

                    if (strToReplace != "")
                    {
                        lstCol.Add("relFKwriters");
                        lstVal.Add(strWriters);
                        ExtServices.UpdateByRecordID("releases", lstCol, lstVal, "relID", Convert.ToInt32(dtReleaseData.Rows[0][0].ToString()));
                    }

                    //Unregistered track, add it
                    else if (strNewIDs != "")
                    {
                        strWriters = strWriters + "■~" + strTrackTitle + "~[" + strNewIDs + "]";

                        lstCol.Add("relFKwriters");
                        lstVal.Add(strWriters);
                        ExtServices.UpdateByRecordID("releases", lstCol, lstVal, "relID", Convert.ToInt32(dtReleaseData.Rows[0][0].ToString()));
                    }

                }
                //If no writers exist
                else
                {
                    string strNewData = "~" + strTrackTitle + "~[" + strNewIDs + "]";

                    lstCol.Add("relFKwriters");
                    lstVal.Add(strNewData);
                    ExtServices.UpdateByRecordID("releases", lstCol, lstVal, "relID", Convert.ToInt32(dtReleaseData.Rows[0][0].ToString()));
                }

                string strHTML = "<span class='spaWriterLabel' style='cursor:pointer'>Written by </span><span class='coloredText spaWriterNames' style='text-decoration:none;cursor:pointer; font-weight:bold; color:current_color'>artist_names</span>";
                string strWriterNames = "", strNewWriterNames = "";
                int intCountWriters = 0;
                foreach (string id in strNewIDs.Split(';'))
                {
                    strWriterNames = intCountWriters == 0 ? "<span data-href='artist_href' class='spaWriterName coloredText' style='font-weight:bold; text-decoration:none;cursor:pointer; color:current_color'>new_name</span>" :
                        strWriterNames + "<span style='font-weight:normal; text-decoration:none;cursor:default; color:#c6c2c6'>, </span>" + "<span data-href='artist_href' class='spaWriterName coloredText' style='font-weight:bold; text-decoration:none;cursor:pointer; color:current_color'>new_name</span>";
                    if (!id.Contains("_not_found"))
                    {
                        DataTable dtCurrentWriter = ExtServices.GetRecordByValue("artists", " artID", id.Replace("{", "").Replace("}", ""));
                        if (dtCurrentWriter != null && dtCurrentWriter.Rows.Count > 0)
                        {
                            strWriterNames = strWriterNames.Replace("new_name", dtCurrentWriter.Rows[0][3].ToString().Replace("█", "\\'"));
                            strWriters = strWriters == "" ? dtCurrentWriter.Rows[0][3].ToString().Replace("█", "\\'") : strWriters + ";" + dtCurrentWriter.Rows[0][3].ToString().Replace("█", "\\'");

                            //Search in stored projects to determine redirection
                            DataTable dtProjects = ExtServices.GetRecordByValue("bands", " bndName", dtCurrentWriter.Rows[0][3].ToString().Replace("█", "\\'"));
                            if (dtProjects == null || dtProjects.Rows.Count == 0)
                            {
                                dtProjects = ExtServices.GetRecordLikeValue("bands", "bndOtherNames", dtCurrentWriter.Rows[0][3].ToString().Replace("█", "\\'"));

                                //project not found
                                if (dtProjects == null || dtProjects.Rows.Count == 0)
                                {
                                    string strURL = "https://en.wikipedia.org/wiki/" + dtCurrentWriter.Rows[0][3].ToString().Replace("█", "\\'");
                                    try
                                    {
                                        HttpWebRequest request = WebRequest.Create(strURL) as HttpWebRequest;
                                        request.Method = "HEAD";
                                        HttpWebResponse response = request.GetResponse() as HttpWebResponse;
                                        response.Close();
                                    }
                                    catch
                                    {
                                        strURL = "https://www.google.com/search?q=" + dtCurrentWriter.Rows[0][3].ToString().Replace("█", "\\'").Replace(" ", "+");
                                    }

                                    strWriterNames = strWriterNames.Replace("artist_href", strURL);
                                }
                                //project found
                                else
                                {
                                    strWriterNames = strWriterNames.Replace("artist_href", dtProjects.Rows[0][1].ToString());
                                }
                            }
                            //project found
                            else
                            {
                                strWriterNames = strWriterNames.Replace("artist_href", dtProjects.Rows[0][1].ToString());
                            }

                            intCountWriters++;
                        }
                    }
                    else
                    {
                        string strNotFoundWriter = id.Replace("_not_found", "").Replace("{", "").Replace("}", "");
                        string strURL = "https://en.wikipedia.org/wiki/" + strNotFoundWriter;
                        try
                        {
                            HttpWebRequest request = WebRequest.Create(strURL) as HttpWebRequest;
                            request.Method = "HEAD";
                            HttpWebResponse response = request.GetResponse() as HttpWebResponse;
                            response.Close();
                        }
                        catch
                        {
                            strURL = "https://www.google.com/search?q=" + strNotFoundWriter.Replace(" ", "+");
                        }
                        string strNotFoundWriterNames = "<span data-href='" + strURL + "' class='spaWriterName coloredText' style='font-weight:bold; text-decoration:none;cursor:pointer; color:current_color'>" + strNotFoundWriter + "</span>";

                        strWriterNames = strWriterNames.Contains("new_name") ? strNotFoundWriterNames : strWriterNames + ", " + strNotFoundWriterNames;
                        strNewWriterNames = strNewWriterNames == "" ? strWriterNames : strNewWriterNames + ", " + strWriterNames;
                        strWriters = strWriters == "" ? strNotFoundWriter : strWriters + ";" + strNotFoundWriter;
                    }
                }
                strWriterNames = strNewWriterNames;
                //Separator
                int intSeparator = strWriterNames != "" ? strWriterNames.LastIndexOf(">, <") : -1;

                if (intSeparator != -1)
                {
                    strWriterNames = strWriterNames.Remove(intSeparator, ">, <".Length).Insert(intSeparator, "> and <");
                }

                strHTML = strHTML != "" ? strHTML.Replace("artist_names", strWriterNames).Replace(";", "¿") : "";

                strData = strData + ";" + strHTML;

                string strWriterFieldName = strHTML != "" ? strWriters : "";

                strData = strData + ";" + strWriterFieldName.Replace(";", ",");
            }

            return strData;
        }

        // Track Click
        [System.Web.Services.WebMethod]
        public static string TrackClick(string strWebPath, string strFullName, string strFeatures = "", string strTrackType = "", string strCovers = "", string strOtherData = "", string strEdition = "", string strEditionDate = "", string strDiscFullName = "", string strSinglesPath = "", string strVersion = "", string strOriginalArtist = "", string strWritingCredits = "", string strPlaylist = "")
        {
            strDiscFullName = strDiscFullName != "" && strDiscFullName.Contains(" - ") ? strDiscFullName.Replace(" - ", "：") : strDiscFullName;
            strOtherData = strOtherData.Replace(" by ", "by ");
            if (strWritingCredits.Contains("data-writer") && strOriginalArtist == "")
            {
                if (strWebPath.Contains("Performed by"))
                {
                    int pFrom = strWebPath.IndexOf("Performed by") + "Performed by".Length;
                    int pTo = strWebPath.LastIndexOf("]");
                    strOriginalArtist = strWebPath.Substring(pFrom, pTo - pFrom).Split(';')[0];
                }
                else
                {
                    strOriginalArtist = strWebPath.Replace("http://127.0.0.1:8887/Music", "").Split('/')[2];
                }
            }
            if (strWebPath.Contains(". Disc") && strDiscFullName == "")
            {
                string[] strDiscFullNameArray = strWebPath.Split(new string[] { ". Disc" }, StringSplitOptions.None);
                string[] strDiscPrefix = strDiscFullNameArray[0].Split('/');
                string[] strDiscSufix = strDiscFullNameArray[1].Split('/');
                strDiscFullName = strDiscPrefix.Last() + ". Disc" + strDiscSufix[0];
            }
            if (!strWebPath.Contains("[Box Set]"))
            {
                strWebPath = strWebPath.Replace("%27", "'");
                strFullName = strFullName.Replace("%27", "'");

                if (strWebPath.Split('/').Last().Contains("Performed by "))
                {
                    strOriginalArtist = strOriginalArtist == "" ? strWebPath.Split(new string[] { "Performed by " }, StringSplitOptions.None).Last().Split(';').First() : strOriginalArtist;
                    strFullName = strWebPath.Split('/').Last();
                }

                string strTrackName = strWebPath.Contains("/Video/") ? strFullName.Substring(12, strFullName.LastIndexOf('.') - 12).Replace("  ", " ") : strFullName.Substring(4, strFullName.LastIndexOf('.') - 4).Replace("  ", " ");
                string strCoverPath = "";
                string strDiscPath = "";
                string strAltDiscPath = "";
                string strCurrentDisc = "";
                string strWallPath = "";
                string strAnimationPath = "";
                string strCanvasPath = "";
                string strBracketContent = "";
                string strFullTrackName = strTrackName;

                //Establish source for cover and discs
                string strNewPath = strDiscFullName == "" ? strWebPath.Replace(strFullName, "").Replace(HttpContext.Current.Session["currentServer"].ToString(), HttpContext.Current.Session["currentDisk"].ToString() + "").Replace(".lnk", "") : strWebPath.Replace("/" + strFullName, "").Replace(HttpContext.Current.Session["currentServer"].ToString(), HttpContext.Current.Session["currentDisk"].ToString() + "").Replace(".lnk", "");
                strNewPath = strNewPath.Split('/').Last() == "" && strNewPath.Contains(". Disc ") ? strNewPath.Substring(0, strNewPath.LastIndexOf('/')) : strNewPath;
                string strLastPathSection = strNewPath.Split('/').Last();

                if (strLastPathSection.Contains(". Disc "))
                {
                    strNewPath = strNewPath.Replace(strLastPathSection, "");
                }

                if (strTrackName.Contains(" ["))
                {
                    int start = strTrackName.LastIndexOf(" [") + " [".Length;
                    int end = strTrackName.IndexOf("]", start);
                    strTrackName = strTrackName.Remove(start, end - start).Replace(" []", "");
                    strBracketContent = strFullTrackName.Replace(strTrackName + " [", "").Replace(" [", "").Replace("]", "");
                }

                //For editions with discs
                if (strNewPath.Contains(" Disc ") && strNewPath.Contains('：') && strDiscFullName == "")
                {
                    strNewPath = strNewPath.Remove(strNewPath.Length - 1, 1);
                    strDiscFullName = strNewPath.Split('/').Last().Split('：').First().Substring(4);
                    strNewPath = strNewPath.Replace(strNewPath.Split('/').Last(), "");
                }
                //For singles with editions
                else if (strNewPath.Contains("/Singles") && strNewPath.Contains(" Edition"))
                {
                    string strNewPath2 = strNewPath.Remove(strNewPath.Length - 1, 1);
                    strDiscFullName = strNewPath2.Split('/').Last();
                }

                if (strNewPath.Contains(".mp4"))
                {
                    strNewPath = strNewPath.Replace(strNewPath.Split('/').Last(), "") + "[Artwork]/";
                }

                else if (!strNewPath.Contains("/Singles"))
                {
                    strNewPath = strNewPath + "/[Artwork]/";

                }
                else
                {
                    if (strNewPath.EndsWith("/"))
                    {
                        strNewPath = strNewPath + "[Artwork]/";
                    }
                    else
                    {
                        strNewPath = strNewPath + "/[Artwork]/";
                    }

                }
                string strSinglesPathMod = strSinglesPath.Replace("\\", "/").Replace("%27","'");
                if (strSinglesPathMod.Contains(strTrackName) && strVersion != "version")
                {
                    string strNewSinglePath = Array.Find(strSinglesPathMod.Split(';'), part => part.Contains(strTrackName +"/[Artwork]"))?.Replace("\\", "/");
                    strNewSinglePath = strNewSinglePath != null && strNewSinglePath != "" ? strNewSinglePath : Array.Find(strSinglesPathMod.Split(';'), part => part.Contains(strTrackName))?.Replace("\\", "/");
                    string[] strSplitPath = strNewSinglePath.Split('/');
                    if (strSplitPath.Count() > 7 && strSplitPath[7].Contains(strTrackName) && strSplitPath[8].Contains("[Artwork]")
                        || strSplitPath.Count() > 6 && strSplitPath[6].Contains(strTrackName) && strSplitPath[7].Contains("[Artwork]")
                        || strSplitPath.Count() > 7 && strSplitPath[7].Contains(strTrackName) && strSplitPath[8].Contains("Edition")
                        || strSplitPath.Count() > 6 && strSplitPath[6].Contains(strTrackName) && strSplitPath[7].Contains("Edition"))// Title tracks
                    {
                        strNewPath = strNewSinglePath != null && strNewSinglePath != "" ? strNewSinglePath.Contains("/[Artwork]") ? strNewSinglePath : strNewSinglePath + "/[Artwork]/" : strNewPath;
                    }
                    
                }

                string[] strFileList = Directory.GetFiles(strNewPath);
                Array.Sort(strFileList);
                if (strNewPath.Contains("/Singles"))
                {
                    strNewPath = strNewPath.Replace("/[Artwork]/", "/[Artwork]") + "/";
                    strEditionDate = strNewPath.Replace("/[Artwork]/", "").Split('/').Last().Substring(0, 11);
                }

                foreach (string file in strFileList)
                {
                    if (!file.Contains("Cover") && !file.Contains("Canvas") && !file.Contains("Disc"))
                    {
                        continue;
                    }
                    if (file.Contains("Cover - Animated.") && strCoverPath == "")
                    {
                        strAnimationPath = file;
                    }

                    else if (file.Contains("Canvas - Album."))
                    {
                        strCanvasPath = file;
                    }
                    else if (file.Contains("Canvas - " + strTrackName +"."))
                    {
                        strCanvasPath = file;
                    }

                    else if (file.Contains("Cover - Front.") && strCoverPath == "")
                    {
                        strCoverPath = file;
                        strWallPath = System.IO.File.Exists(strNewPath + "Cover - Inner.jpg") ? strNewPath + "Cover - Inner.jpg" : System.IO.File.Exists(strNewPath + "Cover - Back.jpg") ? strNewPath + "/Cover - Back.jpg" : file;
                    }

                    else if (file.Contains("Cover - Front.") && strCoverPath != "" && strWallPath == "")
                    {
                        strWallPath = System.IO.File.Exists(strNewPath + "Cover - Inner.jpg") ? strNewPath + "Cover - Inner.jpg" : System.IO.File.Exists(strNewPath + "Cover - Back.jpg") ? strNewPath + "/Cover - Back.jpg" : file;
                    }

                    else if (file.Contains("Cover - " + strTrackName + "."))
                    {
                        strCoverPath = file;
                        strAnimationPath = "";
                    }

                    else if (file.Contains("Disc.") && strDiscPath == "")
                    {
                        string strCurrentDiscPath = file.Replace("//", "/");
                        if (!System.IO.File.Exists(strCurrentDiscPath))
                        {
                            strCurrentDiscPath = strCurrentDiscPath.Replace("05. Singles", "01. Studio Albums");
                        }
                        strDiscPath = strCurrentDiscPath;
                    }

                    else if (strDiscFullName != "" && strDiscFullName.Contains('：') && file.Contains(strDiscFullName.Substring(4, strDiscFullName.IndexOf("：") - 4)) && strDiscPath == "")
                    {
                        strCurrentDisc = strDiscFullName.Split('：').First().Substring(4);
                        if (file.Contains(strCurrentDisc + "."))
                        {
                            strDiscPath = file;
                        }
                        else if (file.Contains(strDiscFullName.Split(',').Last().Substring(1)))
                        {
                            strDiscPath = file;
                        }
                    }

                    else if (strDiscFullName != "" && !strDiscFullName.Contains('：') && file.Contains(strDiscFullName.Substring(4) + ".") && strDiscPath == "" && !file.Contains("Cover - "))
                    {
                        strCurrentDisc = strDiscFullName.Substring(4);
                        if (file.Contains(strCurrentDisc + "."))
                        {
                            strDiscPath = file;
                        }
                    }

                    else if (strDiscFullName != "" && strDiscFullName.Contains('：') && file.Contains(strDiscFullName.Substring(4)) && strDiscPath == "")
                    {
                        strCurrentDisc = strDiscFullName.Substring(4);
                        if (file.Contains(strCurrentDisc + "."))
                        {
                            strDiscPath = file;
                        }
                    }

                    //For versions
                    else if (strDiscFullName != "" && strDiscFullName.Contains(',') && strDiscPath == "" && strVersion != "")
                    {
                        strDiscFullName = strDiscFullName.Split(',').Last();
                        if (strDiscFullName.Contains('：'))
                        {
                            strDiscFullName = "000" + strDiscFullName.Split('：').First();
                        }

                        strCurrentDisc = strDiscFullName.Substring(4);
                        if (file.Contains(strCurrentDisc + "."))
                        {
                            strDiscPath = file;
                        }
                    }
                    else if (strDiscPath == "" && file.Contains("Disc") && !file.Contains("Disc "))
                    {
                        strDiscPath = file;
                    }
                    else if (strDiscPath == "" && file.Contains("Disc") && strDiscFullName != "" && file.Contains(strDiscFullName.Substring(4)) && !file.Contains("Cover - "))
                    {
                        strDiscPath = file;
                    }
                    else if (strAltDiscPath == "" && file.Contains("Disc") && strDiscFullName != "" && file.Contains(strDiscFullName.Substring(4)) && file.Contains("Cover - "))
                    {
                        strAltDiscPath = file;
                    }
                }

                if (strSinglesPath != "" && strVersion == "")
                {
                    string[] strPathEdition = strWebPath.Split('/');
                    string strSingleEdition = "Edition";

                    if (strPathEdition.Length > 8 && strPathEdition[8].Contains(strSingleEdition))
                    {
                        strSingleEdition = strPathEdition[8].Substring(12);
                    }

                    string[] strPaths = strSinglesPath.Replace("%27", "'").Replace("\\", "/").Split(';');
                    foreach (string path in strPaths)
                    {
                        string[] strTestString = path.Split(new string[] { strTrackName + "/" }, StringSplitOptions.None);

                        if (strTestString.Length > 2) //Title track singles
                        {
                            string strPath = path.Replace("/[Artwork]", "");
                            strCoverPath = strPath + "/[Artwork]/Cover - Front.jpg";
                            strDiscPath = System.IO.File.Exists(strPath + "/[Artwork]/Disc.png") ? strPath + "/[Artwork]/Disc.png" : strDiscPath;
                            strWallPath = System.IO.File.Exists(strPath + "/[Artwork]/Cover - Inner.jpg") ? strPath + "/[Artwork]/Cover - Inner.jpg" : System.IO.File.Exists(strPath + "/[Artwork]/Cover - Back.jpg") ? strPath + "/[Artwork]/Cover - Back.jpg" : strPath + "/[Artwork]/Cover - Front.jpg";
                            strAnimationPath = "";
                            break;
                        }

                        //else if (path.Contains(strTrackName + "/") || (strBracketContent != "" && path.Contains(strTrackName + " [" + strBracketContent + "]/")))
                        else if (path.Contains(strTrackName + "/00.") || (path.Contains(strTrackName + "/") && path.Split('/').Last().Contains(strSingleEdition)))
                        {
                            string[] strSplitPath = path.Split('/');
                            if (strSplitPath.Count() > 7 && strSplitPath[7].Contains(strTrackName) && strSplitPath[8].Contains("[Artwork]")
                                || strSplitPath.Count() > 6 && strSplitPath[6].Contains(strTrackName) && strSplitPath[7].Contains("[Artwork]")
                                || strSplitPath.Count() > 7 && strSplitPath[7].Contains(strTrackName) && strSplitPath[8].Contains("Edition")
                                || strSplitPath.Count() > 6 && strSplitPath[6].Contains(strTrackName) && strSplitPath[7].Contains("Edition"))// Title tracks
                            {
                                //string strPath = path.Replace("/[Artwork]", "");
                                //strCoverPath = strPath + "/[Artwork]/Cover - Front.jpg";
                                //strDiscPath = System.IO.File.Exists(strPath + "/[Artwork]/Disc.png") ? strPath + "/[Artwork]/Disc.png" : "/Images/System/Disc.png";
                                //strWallPath = System.IO.File.Exists(strPath + "/[Artwork]/Cover - Inner.jpg") ? strPath + "/[Artwork]/Cover - Inner.jpg" : System.IO.File.Exists(strPath + "/[Artwork]/Cover - Back.jpg") ? strPath + "/[Artwork]/Cover - Back.jpg" : strPath + "/[Artwork]/Cover - Front.jpg";
                                //strAnimationPath = "";
                            }
                        }
                    }
                }

                //For external artists, update Release title and Artist ID
                string strReleaseTitle = "";
                string strCurrentArtistID = "";
                string strNewArtist = "";
                if (strWebPath.Contains("/Audio/") && !strWebPath.Contains(HttpContext.Current.Session["curReleaseName"].ToString().Substring(12)))
                {
                    strReleaseTitle = strWebPath.Split(new string[] { "/Audio" }, StringSplitOptions.None)[1].ToString().Split('/')[2].ToString();
                    strCurrentArtistID = strWebPath.Split(new string[] { "/Audio" }, StringSplitOptions.None)[0].ToString().Split('/')[5].ToString();
                    DataTable dtCurrentNewArtist = ExtServices.GetRecordByValue("bands", " bndName", strCurrentArtistID);
                    strCurrentArtistID = dtCurrentNewArtist.Rows[0][0].ToString() + " ";
                    strNewArtist = dtCurrentNewArtist.Rows[0][0].ToString();
                }
                else
                {
                    strReleaseTitle = HttpContext.Current.Session["curReleaseName"].ToString();
                    strCurrentArtistID = HttpContext.Current.Session["curArtistID"].ToString();
                }

                string strReleaseName = strReleaseTitle.Substring(12);

                strEditionDate = strEditionDate == "" || !strEditionDate.Contains('.') ? strReleaseTitle.Substring(0, 11) : strEditionDate;
                HttpContext.Current.Session["curReleaseDate"] = strWebPath.Replace("http://127.0.0.1:8887/", "").Split('/')[5].Length > 10 ? strWebPath.Replace("http://127.0.0.1:8887/", "").Split('/')[5].Substring(0, 11) : strWebPath.Replace("http://127.0.0.1:8887/", "").Split('/')[4].Substring(0, 11);
                CultureInfo provider = CultureInfo.InvariantCulture;
                string strDate = strEditionDate.Substring(0, 11);
                string strFormattedDate = strDate.Remove(strDate.Length - 1).Replace(".", "-");
                //DateTime dtDate = HttpContext.Current.Session["mediaType"].ToString() == "playlist" ? DateTime.Now : dtDate = DateTime.ParseExact(strFormattedDate, new string[] { "yyyy.MM.dd", "yyyy-MM-dd" }, provider, DateTimeStyles.None);
                DateTime dtDate = dtDate = DateTime.ParseExact(strFormattedDate, new string[] { "yyyy.MM.dd", "yyyy-MM-dd" }, provider, DateTimeStyles.None);
                strFormattedDate = dtDate.ToString("MMMM dd, yyyy");

                //Get source of track if it's from singles
                string strCurDir = "";
                int intCheckDir = 0;
                if (strEdition == "" && strWebPath.Contains("05. Singles"))
                {
                    string[] strDirectories = strWebPath.Split('/');


                    foreach (string dir in strDirectories)
                    {
                        if (intCheckDir > 0)
                        {
                            strCurDir = dir + " Single";
                            break;
                        }

                        else if (dir.Contains(strReleaseName))
                        {
                            intCheckDir++;
                        }
                    }
                }
                //strCurDir = strCurDir == "" && strTrackType == "Compilation" ? strEditionDate + " " + strReleaseName : strCurDir;
                //Look for video of song in DB
                DataTable dtLinks = ExtServices.GetRecordByValue("videosource", "visParentID", strCurrentArtistID);
                string strVideoURL = "";

                string strSongTitle = strFullName.Substring(4, strFullName.Length - 8);

                if (strSongTitle.Contains(" ["))
                {
                    int start = strSongTitle.LastIndexOf(" [") + " [".Length;
                    int end = strSongTitle.IndexOf("]", start);
                    strSongTitle = strSongTitle.Remove(start, end - start).Replace(" []", "");
                }

                if (dtLinks != null && dtLinks.Rows.Count > 0)
                {
                    for (int i = 0; i < dtLinks.Rows.Count; i++)
                    {

                        if (dtLinks.Rows[i][3].ToString() == strSongTitle)
                        {
                            strVideoURL = dtLinks.Rows[i][4].ToString();
                            break;
                        }
                    }
                }

                //Switch Cover and disc if it's a single strSongTitle
                char charInitialChar = HttpContext.Current.Session["curArtistName"].ToString().ToUpper()[0];
                charInitialChar = Char.IsDigit(charInitialChar) ? '#' : Char.IsSymbol(charInitialChar) ? '' : charInitialChar;
                if (Directory.Exists(HttpContext.Current.Session["currentDisk"].ToString() + "/" + HttpContext.Current.Session["curPageName"] + "/" + charInitialChar + "/" + HttpContext.Current.Session["curArtistName"].ToString() + "/05. Singles [Music]"))
                {
                    string strSingleAlbumPath = HttpContext.Current.Session["currentDisk"].ToString() + "/" + HttpContext.Current.Session["curPageName"] + "/" + charInitialChar + "/" + HttpContext.Current.Session["curArtistName"].ToString() + "/05. Singles [Music]";
                    string[] strSingleCovers = Directory.GetFiles(strSingleAlbumPath, "Cover - Front.jpg", SearchOption.AllDirectories);
                    string[] strSingleBackgrounds = Directory.GetFiles(strSingleAlbumPath, "Cover - Back.jpg", SearchOption.AllDirectories);
                    string[] strSingleDiscs = Directory.GetFiles(strSingleAlbumPath, "Disc.png", SearchOption.AllDirectories);
                    Array.Sort(strSingleCovers);
                    Array.Sort(strSingleDiscs);
                    Array.Sort(strSingleBackgrounds);
                    string strSingleCoverPath = strSingleCovers.FirstOrDefault(item => item.Contains(strSongTitle));
                    string strSingleDiscPath = strSingleDiscs.FirstOrDefault(item => item.Contains(strSongTitle));
                    string strSingleBackgroundPath = strSingleBackgrounds.FirstOrDefault(item => item.Contains(strSongTitle));

                    //In case the song title exists in the release name but both values are different
                    string strSingleCoverPath2 = strSingleCovers.FirstOrDefault(item => item.Contains(strSongTitle) && item.Split(new[] { ',', ':', '.', '/', '\\', '-' }, StringSplitOptions.RemoveEmptyEntries).Count(r => r.Contains(strSongTitle)) >= 2);
                    string strSingleDiscPath2 = strSingleDiscs.FirstOrDefault(item => item.Contains(strSongTitle) && item.Split(new[] { ',', ':', '.', '/', '\\', '-' }, StringSplitOptions.RemoveEmptyEntries).Count(r => r.Contains(strSongTitle)) >= 2);
                    string strSingleBackgroundPath2 = strSingleBackgrounds.FirstOrDefault(item => item.Contains(strSongTitle) && item.Split(new[] { ',', ':', '.', '/', '\\', '-' }, StringSplitOptions.RemoveEmptyEntries).Count(r => r.Contains(strSongTitle)) >= 2);
                    strSingleCoverPath = strSingleCoverPath2 != null && strSingleCoverPath2 != "" ? strSingleCoverPath2 : strSingleCoverPath;
                    strSingleDiscPath = strSingleDiscPath2 != null && strSingleDiscPath2 != "" ? strSingleDiscPath2 : strSingleDiscPath;
                    strSingleBackgroundPath = strSingleBackgroundPath2 != null && strSingleBackgroundPath2 != "" ? strSingleBackgroundPath2 : strSingleBackgroundPath;

                    //Title Track as single! If songtitle is different to release name or if the strSingleCoverPath contains the song title twice
                    int intCountSongTitle = strSingleCoverPath != null && strSingleCoverPath != "" ? (strSingleCoverPath.Length - strSingleCoverPath.Replace(strSongTitle, "").Length) / strSongTitle.Length : 0;
                    if (HttpContext.Current.Session["curReleaseName"].ToString() != strSongTitle || intCountSongTitle == 2)
                    {
                        strCoverPath = strSingleCoverPath != null && strSingleCoverPath != "" ? strSingleCoverPath.Replace("\\", "/") : strCoverPath;
                        strDiscPath = strSingleDiscPath != null && strSingleDiscPath != "" ? strSingleDiscPath.Replace("\\", "/") : strDiscPath;
                        strWallPath = strSingleBackgroundPath != null && strSingleDiscPath != "" ? strSingleBackgroundPath.Replace("\\", "/") : strWallPath;
                    }
                }
                strCoverPath = strCoverPath != null && strCoverPath != "" ? strCoverPath : "";
                strDiscPath = strDiscPath != null && strDiscPath != "" ? strDiscPath.Replace(HttpContext.Current.Session["currentDisk"].ToString() + "", HttpContext.Current.Session["currentServer"].ToString()).Replace("'", "%27") : System.IO.File.Exists(HttpContext.Current.Server.MapPath("~/Images/System/") + "Disc.png") ? "/Images/System/" + "Disc.png" : "";
                if (strCurrentArtistID != "" && strNewArtist == "" && strPlaylist == "1")
                {
                    strNewArtist = strCurrentArtistID.Replace(" ","");
                }
                string strReturnData = strCoverPath.Replace(HttpContext.Current.Session["currentDisk"].ToString() + "", HttpContext.Current.Session["currentServer"].ToString()).Replace("'", "%27") + ";" +
                    strDiscPath + ";" + strWallPath.Replace(HttpContext.Current.Session["currentDisk"].ToString() + "", HttpContext.Current.Session["currentServer"].ToString()).Replace("'", "%27") + ";" +
                    strAnimationPath.Replace(HttpContext.Current.Session["currentDisk"].ToString() + "", HttpContext.Current.Session["currentServer"].ToString()).Replace("'", "%27") + ";" +
                    strReleaseName + ";" + strFormattedDate + ";" + strCurDir.Replace(";", ",") + ";" +
                    strVideoURL + ";" + strNewArtist + ";" + strOriginalArtist;

                MusicBrainzClient client = new MusicBrainzClient();
                string strWriters = "";
                string strResultWriter = "", strNewFieldValue = "";
                string strTrackNameNoBrackets = strTrackName;
                if (strTrackNameNoBrackets.Contains(" ["))
                {
                    int index = strTrackNameNoBrackets.IndexOf(" [");
                    if (index >= 0)
                        strTrackNameNoBrackets = strTrackNameNoBrackets.Substring(0, index);
                }

                //If field is empty or if it doesn't contain the name of the track
                if (strWritingCredits == "" || (strWritingCredits != "" && !strWritingCredits.Contains("data-writer[") && !strWritingCredits.ToLower().Contains(strTrackNameNoBrackets.ToLower().Replace("'", "▀").Replace(",", "■"))))
                {
                    string strArtistName = HttpContext.Current.Session["curArtistName"].ToString();
                    string strArtistID = HttpContext.Current.Session["curArtistID"].ToString();
                    string strReleaseDate = HttpContext.Current.Session["curReleaseDate"].ToString();
                    if (HttpContext.Current.Session["mediaType"].ToString() != "playlist")
                    {
                        Task<string> taskId = Task.Run(() => GetRecordingData(client, strArtistName, strReleaseName, strTrackNameNoBrackets, strArtistID, strReleaseDate, strWritingCredits));
                        taskId.Wait();
                        string strResponse = taskId.Result;
                        strResultWriter = strResponse.Split('¡')[0];
                        strNewFieldValue = strResponse.Split('¡')[1];
                    }
                }
                // Writer already exists for the track
                else if (strWritingCredits != "" && strWritingCredits.ToLower().Contains(strTrackName.ToLower().Replace("'", "▀").Replace(",", "■")))
                {
                    string strWritingCreditsTemp = strWritingCredits.Replace("■ ", ", ");
                    foreach (string strTrackCredits in strWritingCreditsTemp.Split('■'))
                    {
                        string strTempTrackCredits = strTrackCredits.Replace(", ", "■ ");
                        if (strTempTrackCredits.ToLower().Contains(strTrackName.ToLower().Replace("'", "▀").Replace(",", "■")))
                        {
                            strResultWriter = strTempTrackCredits.Replace("~" + strTrackName.Replace("'", "▀").Replace(",", "■") + "~[", "").Replace("]", "");
                            strNewFieldValue = strWritingCredits;
                            break;
                        }
                    }
                }

                //If writer was found format html
                if (strResultWriter != "" || strWritingCredits.Contains("data-writer["))
                {
                    string[] strWriterIDs = !strWritingCredits.Contains("data-writer[") ? strResultWriter.Split(';'): strWritingCredits.Replace("data-writer[", "").Replace("]", "").Split(';');
                    string strOriginSource = "Written by ";
                    if (strWebPath.Contains("/Video/") && strWebPath.Contains(".mp4"))
                    {
                        strOriginSource = "Directed by ";
                        string strVidProducer = dtLinks.AsEnumerable().Where(row => row.Field<string>(3) == strFullTrackName).Select(row => row.Field<string>(6)).FirstOrDefault()?.ToString();
                        if (strVidProducer != null && strVidProducer != "")
                        {
                            strWriterIDs = new string[] { strVidProducer + "_not_found" };
                        }
                    }
                    string strHTML = "<span class='spaWriterLabel' style='cursor:pointer'>"+ strOriginSource + "</span><span class=' spaWriterMain coloredText' style='text-decoration:none;cursor:pointer; font-weight:bold; color:current_color'> artist_names</span>";
                    string strWriterNames = "";
                    string strNotFoundWriterNames = "";
                    int intCountWriters = 0;
                    foreach (string id in strWriterIDs)
                    {
                        if (!id.Contains("_not_found"))
                        {
                            strWriterNames = intCountWriters == 0 ? "<span data-href='artist_href' class='spaWriterName coloredText' style='font-weight:bold; text-decoration:none;cursor:pointer; color:current_color'>new_name</span>" :
                            strWriterNames + "<span style='font-weight:normal; text-decoration:none;cursor:default; color:#c6c2c6'>, </span>" + "<span data-href='artist_href' class='spaWriterName coloredText' style='font-weight:bold; text-decoration:none;cursor:pointer; color:current_color'>new_name</span>";

                            DataTable dtCurrentWriter = id.Contains("_bnd") ? ExtServices.GetRecordByValue("bands", " bndID", id.Replace("{", "").Replace("}", "").Replace("_bnd", "")) : ExtServices.GetRecordByValue("artists", " artID", id.Replace("{", "").Replace("}", ""));
                            if (dtCurrentWriter == null && id.Contains("~["))
                            {
                                string strNewWriterId = id.Split('[')[1];
                                dtCurrentWriter = id.Contains("_bnd") ? ExtServices.GetRecordByValue("bands", " bndID", strNewWriterId.Replace("{", "").Replace("}", "").Replace("_bnd", "")) : ExtServices.GetRecordByValue("artists", " artID", strNewWriterId.Replace("{", "").Replace("}", ""));

                            }
                            if (dtCurrentWriter != null && dtCurrentWriter.Rows.Count > 0)
                            {
                                string strCurrentWriterName = id.Contains("_bnd") ? dtCurrentWriter.Rows[0][1].ToString() : dtCurrentWriter.Rows[0][3].ToString();
                                strWriterNames = strWriterNames.Replace("new_name", strCurrentWriterName.Replace("█", "\\'"));
                                strWriters = strWriters == "" ? strCurrentWriterName.Replace("█", "\\'") : strWriters + ";" + strCurrentWriterName.Replace("█", "\\'");

                                //Search in stored projects to determine redirection
                                DataTable dtProjects = ExtServices.GetRecordByValue("bands", " bndName", strCurrentWriterName.Replace("█", "\\'"));
                                if (dtProjects == null || dtProjects.Rows.Count == 0)
                                {
                                    dtProjects = ExtServices.GetRecordLikeValue("bands", "bndOtherNames", strCurrentWriterName.Replace("█", "\\'"));

                                    //project not found
                                    if (dtProjects == null || dtProjects.Rows.Count == 0)
                                    {
                                        string strURL = "https://en.wikipedia.org/wiki/" + strCurrentWriterName.Replace("█", "\\'");
                                        try
                                        {
                                            HttpWebRequest request = WebRequest.Create(strURL) as HttpWebRequest;
                                            request.Method = "HEAD";
                                            HttpWebResponse response = request.GetResponse() as HttpWebResponse;
                                            response.Close();
                                        }
                                        catch
                                        {
                                            strURL = "https://www.google.com/search?q=" + strCurrentWriterName.Replace("█", "\\'").Replace(" ", "+");
                                        }

                                        strWriterNames = strWriterNames.Replace("artist_href", strURL);
                                    }
                                    //project found
                                    else
                                    {
                                        strWriterNames = strWriterNames.Replace("artist_href", dtProjects.Rows[0][1].ToString());
                                    }
                                }
                                //project found
                                else
                                {
                                    strWriterNames = strWriterNames.Replace("artist_href", dtProjects.Rows[0][1].ToString());
                                }

                                intCountWriters++;
                            }
                        }
                        else
                        {
                            string strNotFoundWriter = id.Replace("_not_found", "").Replace("{", "").Replace("}", "");
                            string strURL = "https://en.wikipedia.org/wiki/" + strNotFoundWriter;
                            try
                            {
                                HttpWebRequest request = WebRequest.Create(strURL) as HttpWebRequest;
                                request.Method = "HEAD";
                                HttpWebResponse response = request.GetResponse() as HttpWebResponse;
                                response.Close();
                            }
                            catch
                            {
                                strURL = "https://www.google.com/search?q=" + strNotFoundWriter.Replace(" ", "+");
                            }
                            strNotFoundWriterNames = "<span data-href='" + strURL + "' class='spaWriterName coloredText' style='font-weight:bold; text-decoration:none;cursor:pointer; color:current_color'>" + strNotFoundWriter + "</span>";
                            strWriterNames = strWriterNames == "" ? strNotFoundWriterNames : strWriterNames + "<span style='font-weight:normal; text-decoration:none;cursor:default; color:#c6c2c6'>, </span>" + strNotFoundWriterNames;
                            strWriters = strWriters == "" ? strNotFoundWriter : strWriters + ";" + strNotFoundWriter;
                            intCountWriters++;
                        }
                    }

                    //Separator
                    int intSeparator = strWriterNames != "" ? strWriterNames.LastIndexOf(">, <") : -1;

                    if (intSeparator != -1)
                    {
                        strWriterNames = strWriterNames.Remove(intSeparator, ">, <".Length).Insert(intSeparator, "> and <");
                    }

                    strHTML = strHTML != "" ? strHTML.Replace("artist_names", strWriterNames).Replace(";", "¿") : "";

                    strReturnData = strReturnData + ";" + strHTML;

                    string strWriterFieldName = strHTML != "" ? strWriters : "";

                    strReturnData = strReturnData + ";" + strWriterFieldName.Replace(";", ",") + ";" + strNewFieldValue.Replace(";", "¿");
                }
                if (strCanvasPath == null || strCanvasPath == "")
                {
                    string strRootPath = strWebPath.Split(new string[] {" [Music]/"}, StringSplitOptions.None)[0].Replace(HttpContext.Current.Session["currentServer"].ToString(), HttpContext.Current.Session["currentDisk"].ToString()).Replace("%27","'");
                    if (Directory.Exists(strRootPath + " [Music]/" + HttpContext.Current.Session["curReleaseName"].ToString()))
                    {
                        string[] arrAllFiles = Directory.GetFiles(strRootPath + " [Music]/" + HttpContext.Current.Session["curReleaseName"].ToString(), "*.mp4", SearchOption.AllDirectories);
                        Array.Sort(arrAllFiles);
                        strCanvasPath = arrAllFiles.FirstOrDefault(item => item.Contains("Canvas - "));
                        strCanvasPath = strCanvasPath == null ? "" : strCanvasPath;
                    }
                }
                strCanvasPath = strCanvasPath == "" && strTrackType == "Compilation" ? "non_available" : strCanvasPath;

                strAltDiscPath = strAltDiscPath != "" ? ";AltDiscPath_" + strAltDiscPath.Replace(HttpContext.Current.Session["currentDisk"].ToString() + "", HttpContext.Current.Session["currentServer"].ToString()).Replace("'", "%27") : "";

                strReturnData = strReturnData + strAltDiscPath + ";" + strCanvasPath.Replace(HttpContext.Current.Session["currentDisk"].ToString() + "", HttpContext.Current.Session["currentServer"].ToString()).Replace("'", "%27") ;

                HttpContext.Current.Session["[Release]"] = strCoverPath.Replace("/" + strCoverPath.Split('/').Last(), "");
                return strReturnData;
            }

            else
            {
                return "";
            }
        }

        [System.Web.Services.WebMethod]
        public static string ArtistLookup(string strArtistName = "")
        {
            int intCheckFolder = 0;

            //Remove space as first character
            if (strArtistName != "" && strArtistName.Substring(0, 1) == " ")
            {
                strArtistName = strArtistName.Substring(1, strArtistName.Length - 1);
            }
            //Remove space as last character
            else if (strArtistName.EndsWith(" "))
            {
                strArtistName = strArtistName.Substring(0, strArtistName.Length - 1);
            }

            string strArtistInitial = strArtistName.Substring(0, 1);
            //Get folder with artist name
            string[] strDirectories = Directory.GetDirectories(HttpContext.Current.Session["currentDisk"].ToString() + "/Music/" + strArtistInitial);
            Array.Sort(strDirectories);
            foreach (string dir in strDirectories)
            {
                string strDirName = Path.GetFileName(dir);
                if (strDirName == strArtistName)
                {
                    intCheckFolder = 1;
                    break;
                }
            }

            //Check for other names if artist wasn't found
            if (intCheckFolder == 0)
            {
                DataTable dtArtists = ExtServices.GetRecordByValueList("artists", "artStageName", strArtistName, "artID");
                if (dtArtists != null && dtArtists.Rows.Count > 0)
                {
                    string[] strAliases = dtArtists.Rows[0][4].ToString().Split(';');
                    if (intCheckFolder == 0)
                    {
                        foreach (string alias in strAliases)
                        {
                            if (intCheckFolder == 0 && alias != "")
                            {
                                if (Directory.Exists(HttpContext.Current.Session["currentDisk"].ToString() + "/Music/" + alias.Substring(0, 1) + "/" + alias))
                                {
                                    intCheckFolder = 1;
                                    strArtistName = alias;
                                    break;
                                }
                            }
                        }
                    }
                }
            }

            if (intCheckFolder == 1)
            {
                return strArtistName;
            }

            else
            {
                string strURL = "https://en.wikipedia.org/wiki/" + strArtistName;

                try
                {
                    HttpWebRequest request = WebRequest.Create(strURL) as HttpWebRequest;
                    request.Method = "HEAD";
                    HttpWebResponse response = request.GetResponse() as HttpWebResponse;
                    response.Close();
                }
                catch
                {
                    strURL = "https://www.google.com/search?q=" + strArtistName.Replace(" ", "+");
                }

                return strURL;
            }
        }
        static string ExtractArtistName(string path)
        {
            // Get filename without extension
            string fileName = Path.GetFileNameWithoutExtension(path);
            // Regular expression to extract text inside "[by ...]"
            Regex regex = new Regex(@"\[by ([^;\]]+)", RegexOptions.IgnoreCase);
            Match match = regex.Match(fileName);
            return match.Success ? match.Groups[1].Value : "Various Artists"; // Use extracted name or default
        }
        static DateTime ExtractDate(string path, Regex dateRegex)
        {
            var match = dateRegex.Match(path);
            return match.Success ? DateTime.ParseExact(match.Value, "yyyy.MM.dd", null) : DateTime.MaxValue; // Assign max date if no match found
        }
        static int DetermineTrackCategory(string path)
        {
            bool isSingle = path.Contains("/Singles/");
            bool hasEdition = path.Split('/').Length > 6; // More than 6 segments suggests editions
            bool hasDisc = path.Contains(". Disc ");

            if (!isSingle && !hasEdition && !hasDisc)
            {
                return 1; // No edition nor disc
            }
            else if (!isSingle && !hasEdition && hasDisc)
            {
                return 2; // No editions but has discs
            }
            else if (!isSingle && hasEdition && !hasDisc)
            {
                return 3; // Has editions but no discs
            }
            else if (!isSingle && hasEdition && hasDisc)
            {
                return 4; // Has editions and discs
            }
            else if (isSingle && !hasEdition)
            {
                return 5; // Single with no editions
            }
            else if (isSingle && hasEdition)
            {
                return 6; // Single with editions
            }

            return 1; // Default case (not matching any category)
        }

        [System.Web.Services.WebMethod]
        public static string TrackVersions(string strTrackTitle = "", string strColor = "", string strOriginalArtist = "")
        {
            strTrackTitle = strTrackTitle.Replace("'", "\'");

            //Language version track title fetch
            if (strTrackTitle.Contains("<span style='font-size:10px'>(“") && strTrackTitle.Contains(" version"))
            {
                strTrackTitle = strTrackTitle.Replace("'font-size:10px'", "");
                strTrackTitle = strTrackTitle.Split(new string[] { "</span>" }, StringSplitOptions.None)[1].ToString();

                if (strTrackTitle.Contains("“"))
                {
                    int pFrom = strTrackTitle.IndexOf("“") + "“".Length;
                    int pTo = strTrackTitle.LastIndexOf("” ");

                    strTrackTitle = "<span>" + strTrackTitle.Substring(pFrom, pTo - pFrom) + "</span>";
                }
            }
            
            //If title has more than 2 times 'span>' then split and take the 1st item only: for titles with content in parentheses
            if (strTrackTitle.Contains("<br>") && strTrackTitle.Split('>').Length - 1 > 2)
            {
                strTrackTitle = strTrackTitle.Split(new string[] { "</span>" }, StringSplitOptions.None)[0].ToString();
                if (strTrackTitle.EndsWith("  "))
                {
                    strTrackTitle = strTrackTitle.Remove(strTrackTitle.Length - 2, 2);
                }

                if (!strTrackTitle.Contains("</span>"))
                {
                    strTrackTitle = strTrackTitle + "</span>";
                }
            }

            string strHTML = "";
            int intCountAudio = 1;

            if (strTrackTitle != "")
            {
                strTrackTitle = strTrackTitle.Replace("<span>", "").Replace("</span>", "");
                string strRootPath = HttpContext.Current.Session["currentDisk"].ToString() + "/" + HttpContext.Current.Session["curPageName"].ToString();
                char charInitialChar = strOriginalArtist != "" ? strOriginalArtist.ToUpper()[0] : HttpContext.Current.Session["curArtistName"].ToString().ToUpper()[0];
                charInitialChar = Char.IsDigit(charInitialChar) ? '#' : Char.IsSymbol(charInitialChar) ? '' : charInitialChar;
                string strReqArtist = strOriginalArtist != "" ? strOriginalArtist : HttpContext.Current.Session["curArtistName"].ToString();
                if (!Directory.Exists(HttpContext.Current.Session["currentDisk"].ToString() + "/" + HttpContext.Current.Session["curPageName"] + "/" + charInitialChar + "/" + strReqArtist))
                {
                    charInitialChar = HttpContext.Current.Session["curArtistName"].ToString().ToUpper()[0];
                    strReqArtist = HttpContext.Current.Session["curArtistName"].ToString();
                }
                
                string strPath = strRootPath + "/" + charInitialChar + "/" + strReqArtist;
                //Get all files with same name and extension of .mp3
                var includeExtensions = ".mp3,.wav,.flac".Split(',').Select(ext => ext.Trim()).ToList();
                string strTrackTitleNoBrackets = Regex.Replace(strTrackTitle, @"\s?\[.*?\]", "");
                string[] strAllVersions = Directory.GetFiles(strPath, "*.*", SearchOption.AllDirectories)
                    ?.Where(file => includeExtensions.Contains(Path.GetExtension(file).ToLower())
                    && !file.Contains("[Artwork]") 
                    && (Regex.Replace(Path.GetFileNameWithoutExtension(file).ToLower().Substring(4), @"\s?\[.*?\]", "") == strTrackTitleNoBrackets.ToLower()
                    || (Path.GetFileNameWithoutExtension(file).ToLower().Contains("[“" + strTrackTitleNoBrackets.ToLower())
                    && Path.GetFileNameWithoutExtension(file).ToLower().Contains(" language ")))).ToArray();

                string[] strExtraVersions = Directory.GetFiles(strRootPath, "*.*", SearchOption.AllDirectories)
                    ?.Where(file => includeExtensions.Contains(Path.GetExtension(file).ToLower())
                    && !file.Contains("[Artwork]") && !file.Contains(strPath) && (file.ToLower().Contains(strReqArtist.ToLower() + " cover")
                    || file.ToLower().Contains("by " + strReqArtist.ToLower())) &&
                    (Regex.Replace(Path.GetFileNameWithoutExtension(file).ToLower().Substring(4), @"\s?\[.*?\]", "") == strTrackTitleNoBrackets.ToLower()
                    || (Path.GetFileNameWithoutExtension(file).ToLower().Contains("[“" + strTrackTitleNoBrackets.ToLower())
                    && Path.GetFileNameWithoutExtension(file).ToLower().Contains(" language ")))).ToArray();

                strAllVersions = strAllVersions.Concat(strExtraVersions).ToArray();
                Array.Sort(strAllVersions);
                Regex dateRegex = new Regex(@"\b(19|20)\d{2}\.\d{2}\.\d{2}\b");
                strAllVersions = strAllVersions
                    .Select(path => new { Path = path, Date = ExtractDate(path, dateRegex) })
                    .OrderBy(item => item.Date)
                    .Select(item => item.Path)
                    .ToArray();
                foreach (var version in strAllVersions)
                {
                    string strNewArtist = "";
                    string stVersionPath = version.Replace("\\", "/");
                    int intContainer = DetermineTrackCategory(stVersionPath);
                    //Check if current track artist is different from original
                    if (strNewArtist == "" && (!stVersionPath.Contains("/" + strReqArtist + "/") && !version.Contains("/" + strReqArtist + "\\")))
                    {
                        strNewArtist = stVersionPath.Split('/')[3];
                    }

                    // if various artists
                    if (strNewArtist == "Various Artists" && version.Contains("[by"))
                    {
                        strNewArtist = ExtractArtistName(version);
                    }
                    string pattern = @"\b\d{4}\.\d{2}\.\d{2}\.";
                    int matchCount = Regex.Matches(version, pattern).Count;
                    int intVersionRelType = matchCount >= 2 || (matchCount == 1 && stVersionPath.Contains(". Disc ")) ? 2 : 1;
                    //Write line in HTML string
                    strHTML = strHTML + TrackRow(stVersionPath, intCountAudio, intVersionRelType, strColor, strNewArtist, true);
                    intCountAudio++;
                }
            }

            //Section title
            string strSectionHeader = "<div class='editionRowVersion' data-edition='" + strTrackTitle.Replace("'", "\'") + "' style='padding:15px; cursor:pointer'><a class='anchorTrack editionTrack coloredText' href='javascript:void(0)' style='text-decoration:none;font-weight:bold;cursor:default; color: " + strColor + "'>" + strTrackTitle.Replace("'", "\'") + " Versions</a></div>";

            if (strHTML != "")
            {
                int intCountItems = 1;
                string[] strHTMLArray = strHTML.Split('█');
                //Array.Sort(strHTMLArray);

                if (strHTMLArray.Length > 2)
                {
                    for (int i = 0; i < strHTMLArray.Length; i++)
                    {
                        if (strHTMLArray[i].ToString() != "")
                        {
                            string strCountItems = intCountItems.ToString().PadLeft(2, '0');
                            strHTMLArray[i] = strHTMLArray[i].ToString().Replace("[RowCountNumber#]", strCountItems + ".");
                            intCountItems++;
                        }
                    }

                    strHTML = string.Join("█", strHTMLArray);
                    strHTML = strHTML.Replace("█", "");
                    return strSectionHeader + "<div id='divTrackVersions'>" + strHTML + "</div>";
                }

                else
                {
                    return "<div id='divTrackVersions'>No other versions were found</div>";
                }
            }

            else
            {
                return "<div id='divTrackVersions'>No other versions were found</div>";
            }
        }

        private static string TrackRow(string track, int intCountAudio, int intContainer, string strColor = "", string strPerformingArtist = "", bool isVersions = false)
        {
            string strHTML = "";

            if (track.Contains(".mp3") || track.Contains(".m4a") || track.Contains(".flac") || track.Contains(".alac") || track.Contains(".wav") || track.Contains(".aac"))
            {
                string strFileName = Path.GetFileNameWithoutExtension(track).Substring(4);
                string strFullName = Path.GetFileName(track);
                string strWebPath = track.Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/", "http://127.0.0.1:8887/").Replace("\\", "/").Replace("'", "%27");
                string strTrackNumber = strFullName.Substring(0, 2);

                string strFeatures = "";
                string strCovers = "";
                string strOtherData = "";
                string strOriginPath = "";
                string strTrackType = HttpContext.Current.Session["curPath"].ToString().Substring(4).Replace("s [Music]", "");
                string strFileNameNoBrackets = strFileName;

                string strDiscFullName = "";
                string strEditionFullName = "";
                string strEditionDate = "";
                string strReleaseName = "";
                string strNameNoDisc = "";
                string strContainerPath = track.Replace(strFullName, "").Replace("\\", "/");
                if (strContainerPath.EndsWith("/"))
                {
                    strContainerPath = strContainerPath.Remove(strContainerPath.Length - 1, 1);
                }

                //Determine if it's inside an edition 
                switch (intContainer)
                {
                    case 1: //No editions, no discs
                    case 5: //Single, no editions
                        strEditionFullName = strContainerPath.Substring(strContainerPath.LastIndexOf('/') + 1);
                        strEditionDate = strEditionFullName.Substring(0, 11);
                        strEditionFullName = strEditionDate + " " + strEditionFullName.Substring(12);
                        break;
                    case 2: //No editions, discs
                        strDiscFullName = strContainerPath.Substring(strContainerPath.LastIndexOf('/') + 1);
                        strReleaseName = strContainerPath.Replace("/" + strDiscFullName, "");
                        strReleaseName = strReleaseName.Substring(strReleaseName.LastIndexOf('/') + 1);
                        strEditionDate = strReleaseName.Substring(0, 11);
                        strEditionFullName = strEditionDate + " " + strReleaseName.Substring(12);
                        break;
                    case 3: //Editions, no discs
                    case 6: //Single, editions
                        strEditionFullName = strContainerPath.Substring(strContainerPath.LastIndexOf('/') + 1);
                        strReleaseName = strContainerPath.Replace("/" + strEditionFullName, "");
                        strReleaseName = strReleaseName.Substring(strReleaseName.LastIndexOf('/') + 1);
                        strEditionDate = strEditionFullName.Substring(0, 11);
                        strDiscFullName = "0000" + strEditionFullName.Substring(12);
                        strEditionFullName = strEditionDate + " " + strReleaseName.Substring(12);
                        break;
                    case 4: //Editions, discs
                        strDiscFullName = strContainerPath.Substring(strContainerPath.LastIndexOf('/') + 1);
                        strNameNoDisc = strContainerPath.Replace("/" + strDiscFullName, "");
                        strEditionFullName = strNameNoDisc.Substring(strNameNoDisc.LastIndexOf('/') + 1);
                        strReleaseName = strNameNoDisc.Replace("/" + strEditionFullName, "");
                        strReleaseName = strReleaseName.Substring(strReleaseName.LastIndexOf('/') + 1);
                        strEditionDate = strEditionFullName.Substring(0, 11);
                        strDiscFullName = "0000" + strEditionFullName.Substring(12) + ", " + strDiscFullName.Substring(4);
                        strEditionFullName = strEditionDate + " " + strReleaseName.Substring(12);
                        break;
                    default:
                        break;
                }

                if (strFileName.Contains(" ["))
                {
                    int start = strFileName.LastIndexOf(" [") + " [".Length;
                    int end = strFileName.IndexOf("]", start);
                    strFileNameNoBrackets = strFileName.Remove(start, end - start).Replace(" []", "");
                    string strBracketContent = strFileName.Replace(strFileNameNoBrackets + " [", "").Replace(", ", ",").Replace(" [", "").Replace("]", "");
                    string[] strTrackDetails = strBracketContent.Split(';');

                    foreach (string detail in strTrackDetails)
                    {
                        string strDetail = detail.Replace("'", "\'");

                        if (strDetail.Contains("Tkn from"))
                        {
                            strDetail = strDetail.Replace("Tkn from", "Taken from");
                        }

                        if (strDetail.Contains("Taken from")) //For links
                        {
                            strOriginPath = strDetail.Replace("Taken f", "F");
                        }

                        else if (strDetail.ToLower().Contains("feat. "))
                        {
                            strFeatures = strDetail;
                        }

                        else if (strDetail.Contains(" cover"))
                        {
                            strCovers = strDetail;
                            strFileName = strFileName.ToLower().Contains("; " + strCovers.ToLower()) ? strFileName.Replace("; " + strCovers, "") : strFileName.ToLower().Contains(strCovers.ToLower() + ";") ? strFileName.Replace(strCovers + ";", "") : strFileName.ToLower().Contains(strCovers) ? strFileName.Replace(strCovers, "") : strFileName;
                        }

                        else if (!strFeatures.Contains(strDetail) && !strCovers.Contains(strDetail))
                        {
                            strOtherData = strDetail;
                        }
                    }
                }

                string strDuration = "";

                if (!track.Contains(".lnk"))
                {
                    AudioFile ObjAF = new AudioFile(track);
                    double dblDuration = ObjAF.Properties.Duration.TotalSeconds;
                    TimeSpan time = TimeSpan.FromSeconds(dblDuration);
                    strDuration = time.ToString(@"mm\:ss");
                }

                string strSubBracketContent = "";

                if (strFileName.Contains("[") && strFileName.Contains("]"))
                {
                    strFileName = strFileName.Replace("[]", "").Replace("[", "(").Replace("]", ")");
                    int startExtra = strFileName.LastIndexOf(" (") + " (".Length;
                    int endExtra = strFileName.IndexOf(")", startExtra);
                    strFileNameNoBrackets = strFileName.Remove(startExtra, endExtra - startExtra).Replace(" ()", "");
                    string strBracketContent = strFileName.Replace(strFileNameNoBrackets + " (", "").Replace(" (", "").Replace(")", "");
                    strBracketContent = !string.IsNullOrEmpty(strBracketContent) && (strBracketContent[0] == ' ' || strBracketContent[0] == '\t') ? strBracketContent.Substring(1) : strBracketContent;
                    strFileName = strFileNameNoBrackets + " <a class='anchorTrack titleExtra coloredText' href='javascript:void(0)' style='font-size:10px; text-decoration:none; color:aliceblue'>(" + strBracketContent.Replace(";", ",") + ", Previously Unreleased)</a>";
                    strSubBracketContent = !strBracketContent.Contains("feat.") && !strBracketContent.Contains(" cover") ? strBracketContent : "";
                }

                if (!strWebPath.Contains(".lnk") && strTrackType.Contains("Compilation") && strSubBracketContent == "")
                {
                    strFileName = strFileName.Replace("color: aliceblue;", "");
                }
                else
                {
                    strFileName = strFileName.Replace(" coloredText", "").Replace(", Previously Unreleased", "");
                }

                string strCountItems = intCountAudio.ToString().PadLeft(2, '0');
                string strSeparator1 = isVersions == false ? "[Row#" + strEditionDate + "]" : "";

                strHTML = strHTML + strSeparator1 +"<div class='row trackRowVersion' data-webpath='" + strWebPath + "' data-fullname='" + strFullName.Replace("'", "%27") + "' data-feat='" + strFeatures.Replace("'", "%27") + "' data-tracktype='" + strTrackType.Replace("'", "%27") + "' data-cover='" + strCovers.Replace("'", "%27") + "'  data-other='" + strOtherData.Replace("'", "%27") + "' data-edition='" + strEditionFullName.Replace("'", "%27") + "' data-editionDate ='" + strEditionDate.Replace("'", "%27") + "' data-disc='" + strDiscFullName.Replace("'", "%27") + "' data-tracknumber='" + strTrackNumber + "' data-performingArtist='" + strPerformingArtist + "' style='padding:10px; padding-right:15px; cursor:pointer'>" +
                                                    "<div class='controlWrapper'><div class='col-1 controlTrack' style='display:none'><a class='anchorTrack' href='javascript:void(0)' style='color: aliceblue; text-decoration:none;'><i class='fa fa-play'></i></a></div>" +
                                                    "<div class='col-1 numberTrack'><a class='anchorTrack' href='javascript:void(0)' style='color: aliceblue;text-decoration:none'>[RowCountNumber#]</a></div></div>" +
                                                    "<div class='col-10'><a class='anchorTrack titleTrack' href='javascript:void(0)' style='color: aliceblue; text-decoration:none'>" + strFileName.Replace(" language version", " version") + "</a></div>" +
                                                    "<div class='col-1'><a class='anchorTrack lengthTrack' href='javascript:void(0)' style='color: aliceblue; text-decoration:none;'>" + strDuration + "</a></div>" +
                                               "</div>█";
            }

            return strHTML;
        }

        [System.Web.Services.WebMethod]
        public static string TrackLyrics(string strTrackTitle = "", string strColor = "")
        {
            string strHTML = "";
            string strTrackArtist = !strTrackTitle.Contains("^") ? HttpContext.Current.Session["curArtistName"].ToString() : strTrackTitle.Split('^')[1];
            strTrackTitle = !strTrackTitle.Contains("^") ? strTrackTitle : strTrackTitle.Split('^')[0];

            //If title has more than 2 times 'span>' then split and take the 1st item only: for titles with content in parentheses
            if (strTrackTitle.Contains("<br>") && strTrackTitle.Split('>').Length - 1 > 2)
            {
                strTrackTitle = strTrackTitle.Split(new string[] { "</span>" }, StringSplitOptions.None)[0].ToString();
                if (strTrackTitle.EndsWith("  "))
                {
                    strTrackTitle = strTrackTitle.Remove(strTrackTitle.Length - 2, 2);
                }

                if (!strTrackTitle.Contains("</span>"))
                {
                    strTrackTitle = strTrackTitle + "</span>";
                }
            }

            strTrackTitle = strTrackTitle.Replace("<span>", "").Replace("</span>", "");
            string strTrackTitleNoAccents = strTrackTitle.Replace("ä", "a").Replace("ë", "e").Replace("ï", "i").Replace("ö", "o").Replace("ü", "u");

            if (strTrackTitle != "" && strTrackArtist != "")
            {
                Task<string> taskId = Task.Run(() => GetLyrics(strTrackTitleNoAccents, strTrackArtist));
                // Wait for the task to complete with a timeout of 10 seconds
                if (taskId.Wait(TimeSpan.FromSeconds(7)))
                {
                    // Task completed within the timeout
                    byte[] bytes = Encoding.GetEncoding("ISO-8859-1").GetBytes(taskId.Result);
                    string strLyrics = Encoding.UTF8.GetString(bytes);

                    string strSectionTitle = "<p class='lyricDiv lyricTitle coloredText' style='font-weight:bold;cursor:default;text-align:center;color:" + strColor + "'>" + strTrackTitle + " Lyrics</p>";
                    string strSectionContent = "<p class='lyricDiv lyricContent coloredText' style='cursor:default;text-align:center;color:aliceblue'>" + strLyrics + " </p>";
                    strHTML = "<div class='lyricDiv'>" + strSectionTitle.Replace("'", "\'") + strSectionContent.Replace("\n", "<br>").Replace("'", "\'") + " </div>";
                }
                else
                {
                    //Lyrics not found, check for other names
                    string strTrackArtistID = HttpContext.Current.Session["curArtistID"].ToString();
                    DataTable dtArtistData = ExtServices.GetRecordByValue("bands", " bndID", strTrackArtistID, "bndID");
                    if (dtArtistData !=null&& dtArtistData.Rows.Count > 0 && dtArtistData.Rows[0][3].ToString() != "")
                    {
                        string[] strOtherNamesArr = dtArtistData.Rows[0][3].ToString().Split(';');
                        foreach (string alias in strOtherNamesArr)
                        {
                            taskId = Task.Run(() => GetLyrics(strTrackTitleNoAccents, alias));
                            if (taskId.Wait(TimeSpan.FromSeconds(7)))
                            {
                                byte[] bytes = Encoding.GetEncoding("ISO-8859-1").GetBytes(taskId.Result);
                                string strLyrics = Encoding.UTF8.GetString(bytes);

                                string strSectionTitle = "<p class='lyricDiv lyricTitle coloredText' style='font-weight:bold;cursor:default;text-align:center;color:" + strColor + "'>" + strTrackTitle + " Lyrics</p>";
                                string strSectionContent = "<p class='lyricDiv lyricContent coloredText' style='cursor:default;text-align:center;color:aliceblue'>" + strLyrics + " </p>";
                                strHTML = "<div class='lyricDiv'>" + strSectionTitle.Replace("'", "\'") + strSectionContent.Replace("\n", "<br>").Replace("'", "\'") + " </div>";
                                break;
                            }
                            else
                            {
                                continue;
                            }
                        }
                    }
                    else
                    {
                        string strSectionTitle = "<p class='lyricDiv lyricTitle coloredText' style='font-weight:bold;cursor:default;text-align:center;color:" + strColor + "'>" + strTrackTitle + " Lyrics</p>";
                        string strSectionContent = "<p class='lyricDiv lyricContent coloredText' style='cursor:default;text-align:center;color:aliceblue'>No lyrics found. </p>";
                        strHTML = "<div class='lyricDiv'>" + strSectionTitle.Replace("'", "\'") + strSectionContent.Replace("\n", "<br>").Replace("'", "\'") + " </div>";
                    }
                }
               
            }
            if (strHTML == "")
            {
                string strSectionTitle = "<p class='lyricDiv lyricTitle coloredText' style='font-weight:bold;cursor:default;text-align:center;color:" + strColor + "'>" + strTrackTitle + " Lyrics</p>";
                string strSectionContent = "<p class='lyricDiv lyricContent coloredText' style='cursor:default;text-align:center;color:aliceblue'>No lyrics found. </p>";
                strHTML = "<div class='lyricDiv'>" + strSectionTitle.Replace("'", "\'") + strSectionContent.Replace("\n", "<br>").Replace("'", "\'") + " </div>";
            }

            return strHTML;
        }

        public static string GetLyrics(string strTrackTitle, string strTrackArtist)
        {
            // Create instance of LyricScraperClient with different lyrics providers
            ILyricsScraperClient lyricsScraperClient
                = new LyricsScraperClient()
                    .WithGenius()
                    .WithAZLyrics()
                    .WithMusixmatch()
                    .WithSongLyrics()
                    .WithLyricFind();

            var searchRequest = new ArtistAndSongSearchRequest(artist: strTrackArtist, song: strTrackTitle);

            var searchResult = lyricsScraperClient.SearchLyric(searchRequest);

            if (!searchResult.IsEmpty())
            {
                return searchResult.LyricText;
            }
            else if (searchResult.Instrumental == true)
            {
                return "Instrumental track";
            }
            else
            {
                return "No lyrics were found";
            }
        }

        [System.Web.Services.WebMethod]
        public static void SaveReproduction(string strTrackPath)
        {
            if (strTrackPath != "")
            {
                DataTable dtMatchingItem = ExtServices.GetRecordByValue("reproductions", " repPath", strTrackPath, "repID");

                //Exists in table so update number of reproductions
                if (dtMatchingItem != null && dtMatchingItem.Rows.Count > 0)
                {
                    string strRepCount = (Convert.ToInt32(dtMatchingItem.Rows[0][5].ToString()) + 1).ToString();

                    ExtServices.UpdateSingleFieldByID("reproductions", strRepCount, "repReproductions", "repID", Convert.ToInt32(dtMatchingItem.Rows[0][0].ToString()));

                }
                //Doesn't exist so store in datatable
                else
                {
                    string[] strPathSections = strTrackPath.Split('/');
                    List<string> lstCol = new List<string>();
                    List<string> lstVal = new List<string>();


                    lstCol.Add("repTitle");
                    lstCol.Add("repArtistID");
                    lstCol.Add("repRelease");
                    lstCol.Add("repMediaType");
                    lstCol.Add("repReproductions");
                    lstCol.Add("repPath");

                    string strFileName = Path.GetFileNameWithoutExtension(strTrackPath).Substring(4);
                    lstVal.Add(strFileName);
                    lstVal.Add(HttpContext.Current.Session["curArtistID"].ToString());
                    lstVal.Add(strPathSections[7]);
                    lstVal.Add(HttpContext.Current.Session["curPageID"].ToString());
                    lstVal.Add("1");
                    lstVal.Add(strTrackPath);

                    ExtServices.InsertByTableName("reproductions", lstCol, lstVal);
                }
            }
        }

        [System.Web.Services.WebMethod]
        public static void UpdateReleaseDetails(string strRelGenres, string strRelLabel, string strRelProducer, string strCurGenres, string strCurLabel, string strCurProducers)
        {
            //update values
            string strReleaseID = HttpContext.Current.Session["curReleaseID"].ToString();
            DataTable dtReleaseData = ExtServices.GetRecordByValue("releases", "relID", strReleaseID);
            string strOldProducers = dtReleaseData.Rows[0][10].ToString();
            string strNewGenres = "";
            string strNewProducers = "";
            if (strReleaseID != "")
            {
                // split genres
                string[] strGenresCur = strCurGenres.Split(';');
                string strCurGenresOld = strRelGenres.Replace("; ", ";").Replace(" ;", ";");

                strNewGenres = "";
                strGenresCur = strCurGenresOld.Split(';');

                foreach (string genre in strGenresCur)
                {
                    //If it starts with space
                    string strCurrentGenre = genre;
                    //If it extists in database
                    DataTable dtGenres = ExtServices.GetRecordByValue("subgenres", "sgnName", strCurrentGenre);
                    if (dtGenres != null && dtGenres.Rows.Count > 0)
                    {
                        strCurrentGenre = CultureInfo.CurrentCulture.TextInfo.ToTitleCase(strCurrentGenre.ToLower());
                        if (!strNewGenres.Contains(strCurrentGenre))
                        {
                            strNewGenres = strNewGenres == "" ? strCurrentGenre : strNewGenres + ";" + strCurrentGenre;
                        }
                    }
                }

                //split producers
                string[] strProducersCur = strCurProducers.Split(';');
                string strCurProducersOld = strRelProducer.Replace("; ", ";").Replace(" ;", ";");
                strNewProducers = "";
                strProducersCur = strCurProducersOld.Split(';');

                foreach (string producer in strProducersCur)
                {
                    //If it starts with space
                    string strCurrentProducer = producer;
                    //If it extists in database
                    DataTable dtProducers = ExtServices.GetRecordByValue("artists", "artStageName", strCurrentProducer);
                    if (dtProducers != null && dtProducers.Rows.Count > 0)
                    {
                        strCurrentProducer = CultureInfo.CurrentCulture.TextInfo.ToTitleCase(strCurrentProducer.ToLower());
                        if (!strNewProducers.Contains(strCurrentProducer))
                        {
                            strNewProducers = strNewProducers == "" ? dtProducers.Rows[0][0].ToString() : strNewProducers + ";" + dtProducers.Rows[0][0].ToString();
                        }
                    }
                    else
                    {
                        dtProducers = ExtServices.GetRecordByValue("bands", "bndName", strCurrentProducer);
                        if (dtProducers != null && dtProducers.Rows.Count > 0)
                        {
                            strCurrentProducer = CultureInfo.CurrentCulture.TextInfo.ToTitleCase(strCurrentProducer.ToLower());
                            if (!strNewProducers.Contains(strCurrentProducer))
                            {
                                strNewProducers = strNewProducers == "" ? dtProducers.Rows[0][0].ToString() + "_bnd" : strNewProducers + ";" + dtProducers.Rows[0][0].ToString() + "_bnd";
                            }
                        }
                    }
                }

                //Validate label
                strRelLabel = strRelLabel.Any(char.IsLower) ? CultureInfo.CurrentCulture.TextInfo.ToTitleCase(strRelLabel.ToLower()) : strRelLabel;
                strRelLabel = strRelLabel.ToLower() != strCurLabel.ToLower() ? strRelLabel : strCurLabel;

                List<string> lstCol = new List<string>();
                List<string> lstVal = new List<string>();


                lstCol.Add("relFKsubgenres");
                lstCol.Add("relFKartists");
                lstCol.Add("relFKcompanies");

                lstVal.Add(strNewGenres);
                lstVal.Add(strNewProducers);
                lstVal.Add(strRelLabel);

                ExtServices.UpdateByRecordID("releases", lstCol, lstVal, "relID", Convert.ToInt32(strReleaseID));
            }
        }
    }
}