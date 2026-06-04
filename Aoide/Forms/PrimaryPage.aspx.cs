using Hqub.MusicBrainz.API;
using Hqub.MusicBrainz.API.Entities;
using MediaBinger;
using NewsAPI;
using NewsAPI.Constants;
using NewsAPI.Models;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System;
using System.Collections;
using System.Collections.Generic;
using System.Data;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Web;
using System.Web.Script.Serialization;
using System.Web.Services;
using System.Web.UI;
using System.Web.UI.WebControls;
using static MediaBinger.ExtServices;
using TMDbLib.Client;
using TMDbLib.Objects.TvShows;
using TMDbLib.Objects.Search;
using TMDbLib.Objects.General;

namespace Aoide.Forms
{
    public partial class PrimaryPage : System.Web.UI.Page
    {
        protected void Page_Load(object sender, EventArgs e)
        {
            string[] strPages = Session["MainPages"] != null ? Session["MainPages"].ToString().Split(';') : new string[0];
            HttpContext.Current.Session["currentDisk"] = "S:";
            HttpContext.Current.Session["currentServer"] = "http://127.0.0.1:8887";
            string strSourceTable = "";
            if (Page.RouteData.Values["PageName"] != null)
            {
                switch (Page.RouteData.Values["PageName"])
                {
                    case "Music":
                        strSourceTable = "bands";
                        break;
                    case "Series":
                        strSourceTable = "series";
                        break;
                    case "Movies":
                        strSourceTable = "movies";
                        break;
                    case "Books":
                        strSourceTable = "books";
                        break;
                    default:
                        strSourceTable = "bands";
                        break;
                }
            }
            SyncFolders(strSourceTable);
            //Get continents
            if (selContinent.Items.Count == 0)
            {
                DataTable dtContinents = ExtServices.GetContinents();
                DataTable dtGenres = ExtServices.GetContentByTableName("genres");

                if (dtContinents != null && dtContinents.Rows.Count > 0)
                {
                    for (int i = 0; i < dtContinents.Rows.Count; i++)
                    {
                        selContinent.Items.Add(new ListItem(dtContinents.Rows[i]["conISO"].ToString() + ';' + dtContinents.Rows[i]["conName"].ToString(), dtContinents.Rows[i]["conID"].ToString()));
                        selContinentBck.Items.Add(new ListItem(dtContinents.Rows[i]["conISO"].ToString() + ';' + dtContinents.Rows[i]["conName"].ToString(), dtContinents.Rows[i]["conID"].ToString()));
                    }
                }

                if (dtGenres != null && dtGenres.Rows.Count > 0)
                {
                    for (int i = 0; i < dtGenres.Rows.Count; i++)
                    {
                        selGenre.Items.Add(new ListItem(dtGenres.Rows[i][2].ToString() + ';' + dtGenres.Rows[i][1].ToString(), dtGenres.Rows[i][0].ToString()));
                        selGenreBck.Items.Add(new ListItem(dtGenres.Rows[i][2].ToString() + ';' + dtGenres.Rows[i][1].ToString(), dtGenres.Rows[i][0].ToString()));
                    }
                }
            }

            foreach (string pageName in strPages)
            {
                string[] strPageName = pageName.Split('-');
                if (Page.RouteData.Values["PageName"] != null && strPageName[0].ToString() != "" && Page.RouteData.Values["PageName"].ToString() == strPageName[1])
                {
                    Session["curPageID"] = strPageName[0];
                    Session["curPageName"] = strPageName[1];
                }
            }
            //If there's session data for current page
            if (Page.RouteData.Values["PageName"] != null && Page.RouteData.Values["PageName"].ToString() == Session["curPageName"].ToString())
            {
                //LoadSite(Page.RouteData.Values["PageName"].ToString());

                DataTable dtMenuItems = ExtServices.GetRecordByValue("menuitems", "meiFKcontenttype", Session["curPageID"].ToString(), "meiOrder");

                //Menu items population
                if (dtMenuItems != null && dtMenuItems.Rows.Count > 0)
                {
                    string strActive = " active";
                    DataTable dtMenuFilters = ExtServices.GetRecordByValue("filters", "filFKcontenttype", Session["curPageID"].ToString(), "filOrder");
                    if (dtMenuFilters != null)
                    {
                        //Loop for each main menu item
                        for (int i = 0; i < dtMenuItems.Rows.Count; i++)
                        {
                            barNavSection.InnerHtml = barNavSection.InnerHtml + " <a id='menuItem" + i + "' class='menuBarButton menuOption" + strActive + "' href='javascript:void(0)' data-value='" + dtMenuItems.Rows[i][0] + "' style='min-width:" + 100 / dtMenuItems.Rows.Count + "%' runat='server'>" + dtMenuItems.Rows[i][1].ToString().ToUpper() + "</a>";
                            strActive = "";

                            //FETCH  FILPARENTID
                            //string[] strParentFields = new[] { Convert.ToString(dtMenuFilters.Rows[i]["filParentField"]) } ;
                            //DataTable dtParentFilters = ExtServices.GetContentByTableName(Convert.ToString(dtMenuFilters.Rows[i]["filParentTable"]));

                            filterBarSection.InnerHtml = filterBarSection.InnerHtml + "<div id='filterItem" + i + "' class='divSubitem divSubitem" + dtMenuItems.Rows[i]["meiID"].ToString() + "' data-value='" + dtMenuItems.Rows[i]["meiID"].ToString() + "' style='display:none'>";
                            //Filter DataTable
                            int intCountSubItems = dtMenuFilters.Select().Where(s => s["filFKmenuitems"].ToString() == dtMenuItems.Rows[i]["meiID"].ToString()).Count();
                            //Loop for each main menu filter
                            for (int j = 0; j < dtMenuFilters.Rows.Count; j++)
                            {
                                //If filter belongs to menu item
                                if (dtMenuFilters.Rows[j]["filFKmenuitems"].ToString() == dtMenuItems.Rows[i]["meiID"].ToString())
                                {
                                    filterBarSection.InnerHtml = filterBarSection.InnerHtml + "<a id='filterSubItem" + dtMenuFilters.Rows[j]["filID"].ToString() + "' class='menuSubItem' href='javascript:void(0)' data-id='" + dtMenuFilters.Rows[j]["filID"].ToString() + "' data-parent='" + dtMenuFilters.Rows[j]["filFKMenuItems"].ToString() + "' data-table='" + dtMenuFilters.Rows[j]["filParentTable"].ToString() + "' data-field='" + dtMenuFilters.Rows[j]["filParentField"].ToString() + "' data-type='" + dtMenuFilters.Rows[j]["filDataType"].ToString() + "' style='min-width:" + 100 / intCountSubItems + "%'>" + dtMenuFilters.Rows[j]["filName"].ToString().ToUpper() + "</a>";
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
            }

            else
            {
                //LoadSite("NOT FOUND");
            }
        }

        public static void SwitchPage(string strValue = "")
        {
            //menContainer.InnerHtml = "<span>" + strValue + "</span>";
        }

        [System.Web.Services.WebMethod]
        public static string FillSubFilters(string strTable = "", string strFields = "", string strParent = "", string strDataType = "")
        {
            string strContentID = strParent == "1" ? "200" : strParent == "6" ? "300" : strParent == "11" ? "300" : strParent == "16" ? "500" : "200";
            string strInnerHTML = "";
            bool booSoloArtist = false;
            DataTable dtSubFilterData = new DataTable();
            switch (strDataType)
            {
                case "option":
                    strInnerHTML = strInnerHTML + "<div id='filterItem" + strParent + "' class='divSubFilter divSubFilter" + strParent + "' data-value='" + strParent + "'>";

                    if (strTable.Contains("date"))
                    {

                        string[] strDates = strTable.Contains("start") ? new[] { "1950\'s", "1960\'s", "1970\'s", "1980\'s", "1990\'s", "2000\'s", "2010\'s", "2020\'s" } : new[] { "All",  "1950\'s", "1960\'s", "1970\'s", "1980\'s", "1990\'s", "2000\'s", "2010\'s", "2020\'s" };
                        foreach (string decade in strDates)
                        {
                            strInnerHTML = strInnerHTML + "<a id='SubFilterOpt" + decade + "' class='subfilterOption SubFilterMain SubChar' href='javascript:void(0)' data-id='0' data-table='" + strTable + "' data-field='" + strFields + "' style='min-width:" + 100 / strDates.Length + "%'>" + decade + "</a>";
                        }
                    }

                    else if (strTable == "genders")
                    {
                        dtSubFilterData = ExtServices.GetContentByTableName(strTable);

                        for (int i = 0; i < dtSubFilterData.Rows.Count; i++)
                        {
                            strInnerHTML = strInnerHTML + "<a id='SubFilterOpt" + i + "' class='subfilterOption SubFilterMain SubOpt' href='javascript:void(0)' data-id='" + dtSubFilterData.Rows[i][0].ToString() + "' style='min-width:" + 100 / dtSubFilterData.Rows.Count + "%' style='color: " + dtSubFilterData.Rows[i][3].ToString() + "'><i class='fa fa-" + dtSubFilterData.Rows[i][2].ToString() + "'></i> " + dtSubFilterData.Rows[i][1].ToString() + "</a>";
                        }

                    }

                    else
                    {
                        if (strTable == "participationtypes")
                        {
                            DataTable dtArtistParticipations = ExtServices.GetRecordByValue("artistparticipations", " arpFKbands", HttpContext.Current.Session["curArtistID"].ToString().Replace(" ",""));
                            string strValues = "";
                            if (dtArtistParticipations != null && dtArtistParticipations.Rows.Count > 0)
                            {
                                for (int i = 0; i < dtArtistParticipations.Rows.Count; i++)
                                {
                                    strValues = strValues == "" ? dtArtistParticipations.Rows[i][5].ToString() : strValues + ";" + dtArtistParticipations.Rows[i][5].ToString();
                                }

                                strValues = strValues.Replace(";", ",");
                                //Validation for solo artists
                                if (dtArtistParticipations.Rows.Count == 1 && strValues == "1,0")
                                {
                                    strValues = "1";
                                    booSoloArtist = true;
                                }
                                dtSubFilterData = ExtServices.GetRecordByValueList(strTable, "parID", strValues);
                            }
                            else
                            {
                                dtSubFilterData = ExtServices.GetContentByTableName(strTable);
                            }
                        }

                        else if (strTable == "" && strFields != "")
                        {
                            dtSubFilterData = new DataTable();
                            dtSubFilterData.Clear();
                            dtSubFilterData.Columns.Add("dtID");
                            dtSubFilterData.Columns.Add("dtName");

                            string[] strContentFields = strFields.Split(';');
                            for (int i = 0; i < strContentFields.Count(); i++)
                            {
                                DataRow dtRow = dtSubFilterData.NewRow();
                                dtRow["dtID"] = i.ToString();
                                dtRow["dtName"] = strContentFields[i].ToString();
                                dtSubFilterData.Rows.Add(dtRow);
                            }
                        }
                        else
                        {
                            dtSubFilterData = ExtServices.GetContentByTableName(strTable);
                        }

                        if (dtSubFilterData != null)
                        {
                            for (int i = 0; i < dtSubFilterData.Rows.Count; i++)
                            {
                                string strSubFilterDisplay = booSoloArtist == false ? "" : "; display: none";
                                strInnerHTML = strInnerHTML + "<a id='SubFilterOpt" + i + "' class='subfilterOption SubFilterMain SubOpt' href='javascript:void(0)' data-id='" + dtSubFilterData.Rows[i][0].ToString() + "' style='min-width:" + 100 / dtSubFilterData.Rows.Count + "%" + strSubFilterDisplay + "'>" + dtSubFilterData.Rows[i][1].ToString() + "</a>";
                            }
                        }

                        if (booSoloArtist == false)
                        {
                            
                        }
                    }
                    strInnerHTML = strInnerHTML + "</div>";
                    break;

                case "list":
                    strInnerHTML = strInnerHTML + "<div id='filterItem" + strParent + "' class='divSubFilter divSubFilter" + strParent + "' data-value='" + strParent + "'>";
                    //Loop for each main menu filter
                    string[] strChars = new[] { "All", "#", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "•", "Search" };
                    foreach (string charac in strChars)
                    {
                        if (charac == "Search")
                        {
                            strInnerHTML = strInnerHTML + "<div id='filterSearch" + strParent + "' class='divSubFilter divSubFilterSearch' data-value='" + strParent + "'>";
                            strInnerHTML = strInnerHTML + "<input id='SubFilterOpt" + charac + "' class='subfilterOption FilterSearch form-control' type='text' data-id='0' placeholder='" + charac + "' data-table='" + strTable + "' data-field='" + strFields + "' style='width:" + 100 / 8 + "%' list='lstSearchFilter'/><datalist id='lstSearchFilter'></datalist>";
                            strInnerHTML = strInnerHTML + "</div>";
                        }
                        else
                        {
                            strInnerHTML = strInnerHTML + "<a id='SubFilterOpt" + charac + "' class='subfilterOption SubFilterMain SubChar' href='javascript:void(0)' data-id='0' data-table='" + strTable + "' data-field='" + strFields + "' style='min-width:" + 100 / strChars.Length + "%'>" + charac + "</a>";
                        }
                    }
                    strInnerHTML = strInnerHTML + "</div>";
                    break;

                case "select":
                    strInnerHTML = strInnerHTML + "<div id='filterSearch" + strParent + "' class='divSubFilter divSubFilterSelect' data-value='" + strParent + "'>";
                    strInnerHTML = strInnerHTML + "<select id='SubFilterOptSelect' class='form - control inputField input-lg select2' data-id='0' data-table='" + strTable + "' data-field='" + strFields + "' style='width:" + 100 / 1 + "%' ><option value='NaN' disabled='disabled'>DisOption;arrow-right;Select an option</option>";
                    strInnerHTML = strInnerHTML + GetSearchFilter("addSelectOption", strTable, strContentID, strParent);
                    strInnerHTML = strInnerHTML + "</select></div>";
                    break;

                case "search":
                    strInnerHTML = strInnerHTML + "<div id='filterSearch" + strParent + "' class='divSubFilter divSubFilterSearch' data-value='" + strParent + "'>";
                    strInnerHTML = strInnerHTML + "<input id='SubFilterOptSearch' class='subfilterOption FilterSearch form-control' type='text' data-id='0' placeholder='Insert name' data-table='" + strTable + "' data-field='" + strFields + "' style='width:" + 100 / 1 + "%' list='lstSearchFilter'/><datalist id='lstSearchFilter'></datalist>";
                    strInnerHTML = strInnerHTML + "</div>";
                    break;

                case "main-subitem":
                    //Get name of folders
                    string[] strFieldArr = strFields.ToString().Split(';');
                    //Get subfolders
                    string path = HttpContext.Current.Session["currentDisk"].ToString() + "/" + HttpContext.Current.Session["curPageName"] + "/" + HttpContext.Current.Session["curArtistInitial"] + "/" + HttpContext.Current.Session["curArtistName"].ToString() + "/" + strParent;
                    if (Directory.Exists(path))
                    {
                        strFieldArr = Directory.GetDirectories(path).Where(subdir => Directory.Exists(subdir)).ToArray();
                        Array.Sort(strFieldArr);
                    }
                    
                    int intCountFields = 0, intCountFolders = 0;
                    string strHideBar = strParent == "audio" || strParent == "gallery" ? "" : "style='visibility : hidden'";
                    strInnerHTML = strInnerHTML + "<div id='filterSearchMainSubItem' class='divSubFilter divSubFilterSearch' "+ strHideBar + ">";

                    if (strParent != "gallery" || strParent != "library")
                    {
                        intCountFields = strParent == "audio" && HttpContext.Current.Session["curArtistID"].ToString() != "120 " && HttpContext.Current.Session["curArtistID"].ToString() != "120" ? strFieldArr.Length + 1 : strFieldArr.Length;
                    }

                    bool hasGalleryTours = strFieldArr.Any(p => p.Contains("gallery\\Tours"));

                    if (hasGalleryTours)
                    {
                        intCountFields--;
                    }
                    
                    foreach (string field in strFieldArr)
                    {
                        if (field.Contains("gallery\\Tours"))
                        {
                            continue;
                        }
                        string strFieldName = field.Split('\\').Last().ToString();
                        strInnerHTML = strInnerHTML + "<a id='SubMainFilterOpt" + intCountFolders + "' class='subfilterOption2 SubFilterMain SubChar' href='javascript:void(0)' data-field='" + field.Remove(0, 1) + "' style='min-width:" + 100 / intCountFields + "% '>" + strFieldName.ToUpper() + "</a>";
                        intCountFolders++;

                        if (strParent != "audio" && strParent != "gallery")
                        {
                            break;
                        }
                    }
                    //Add playlists for music
                    if (strParent == "audio" && HttpContext.Current.Session["curArtistID"].ToString() != "120 " && HttpContext.Current.Session["curArtistID"].ToString() != "120")
                    {
                        strInnerHTML = strInnerHTML + "<a id='SubMainFilterOpt" + intCountFolders + "' class='subfilterOption2 SubFilterMain SubChar' href='javascript:void(0)' data-field='[playlists]' style='min-width:" + 100 / intCountFields + "% '>PLAYLISTS</a>";
                    }

                    strInnerHTML = strInnerHTML + "</div>";
                    break;
                default:
                    break;
            }
            //ID for various artists to solve wrong visualization of bar
            if (HttpContext.Current.Session["curArtistID"] != null && (HttpContext.Current.Session["curArtistID"].ToString() == "120 " || HttpContext.Current.Session["curArtistID"].ToString() == "120"))
            {
                strInnerHTML = strInnerHTML + "VARIOUS_ARTISTS";
            }
            return strInnerHTML;
        }
        // Method to retrieve registered items and display them in datalist
        [System.Web.Services.WebMethod]
        public static string GetSearchFilter(string strName = "", string strTable = "", string strContentID = "", string strParent = "")
       {
            //Look for entries in database
            DataTable dtData = new DataTable();
            if (strTable == "genres")
            {
                dtData = ExtServices.GetRecordByValue(strTable, "genMediaTypeID", strContentID);
            }
            else
            {
                dtData = strTable != "" && strTable != "artists" && !strTable.Contains("cust_") ? ExtServices.GetContentByTableName(strTable) : new DataTable();
            }

            DataTable dtColumns = strTable != "" && !strTable.Contains("cust_") ? ExtServices.GetTableColumns(strTable) : new DataTable();
            MusicBrainzClient client = new MusicBrainzClient();
            //Get folder list from hard drive
            //string rootPath = @HttpContext.Current.Session["currentDisk"].ToString() + "\";
            string rootPath = @"C:\Users\Surface Pro 6\Downloads\MediaBinger\";
            string strFolderName = "";
            string strContent = "";
            string strID = "";

            rootPath = Path.Combine(rootPath, HttpContext.Current.Session["curPageName"].ToString());

            //Make dirs to contain names of the bands registered, filtered by artists (dtData)
            switch (strTable)
            {
                case "artists":
                    dtData = ExtServices.GetRecordLikeValue("artists", "artStageName", strName);
                    if (dtData!= null && dtData.Rows.Count > 0)
                    {

                        for (int i = 0; i < dtData.Rows.Count; i++)
                        {
                            if (dtData.Rows[i][3].ToString() != ""  && strName.Length <= dtData.Rows[i][3].ToString().Length && dtData.Rows[i][3].ToString().Substring(0, strName.Length).ToLower() == strName.ToLower())
                            {
                                strContent += dtData.Rows[i][0].ToString() != "" ? "<option class='searchFilterOpt clickFilterOpt' data-value='" + dtData.Rows[i][0].ToString() + "' value='" + dtData.Rows[i][3].ToString() + "'/>" : "";
                            }
                        }
                    }
                    break;
                case "cust_releases":
                    dtData = ExtServices.GetDistinctRecordByValue("relFKcompanies", "releases", "relFKcompanies", "Self-released record", "!=", "relFKcompanies");
                    if (dtData != null && dtData.Rows.Count > 0)
                    {
                        for (int i = 0; i < dtData.Rows.Count; i++)
                        {
                            if (dtData.Rows[i][0].ToString() != "" && !dtData.Rows[i][0].ToString().ToLower().Contains(strName.ToLower()))
                            {
                                strContent += dtData.Rows[i][0].ToString() != "" ? "<option id='" + dtData.Rows[i][0].ToString() + "' class='searchFilterOpt clickFilterOpt' data-value='" + dtData.Rows[i][0].ToString() + "' value='" + dtData.Rows[i][0].ToString() + "'>Label;" + dtData.Rows[i][0].ToString() +"</option>" : "";
                            }
                        }
                    }
                    break;
                case "cust_producers":
                    dtData = ExtServices.GetDistinctRecordByValue("artStageName", "artists", "artFKoccupations", "1", "=", "artFKoccupations");
                    if (dtData != null && dtData.Rows.Count > 0)
                    {
                        for (int i = 0; i < dtData.Rows.Count; i++)
                        {
                            if (dtData.Rows[i][0].ToString() != "" && !dtData.Rows[i][0].ToString().ToLower().Contains(strName.ToLower()))
                            {
                                strContent += dtData.Rows[i][0].ToString() != "" ? "<option id='" + dtData.Rows[i][0].ToString() + "' class='searchFilterOpt clickFilterOpt' data-value='" + dtData.Rows[i][0].ToString() + "' value='" + dtData.Rows[i][0].ToString() + "'>Producer;" + dtData.Rows[i][0].ToString() + "</option>" : "";
                            }
                        }
                    }
                    break;
                case "bands":
                    string[] dirsTop = Directory.GetDirectories(rootPath, "*", SearchOption.TopDirectoryOnly);
                    Array.Sort(dirsTop);
                    //TODO consider aliases
                    foreach (string dirTop in dirsTop)
                    {
                        string[] dirs = Directory.GetDirectories(dirTop, "*", SearchOption.TopDirectoryOnly);
                        Array.Sort(dirs);
                        foreach (string dir in dirs)
                        {
                            int intNullFlag = 0;
                            DirectoryInfo dir_info = new DirectoryInfo(dir);
                            strFolderName = dir_info.Name;
                            if (strName.Length <= strFolderName.Length && strFolderName.Substring(0, strName.Length).ToLower() == strName.ToLower())
                            {
                                //Look if name is in datatable
                                string strColName = dtColumns.Rows[1][0].ToString();
                                string strColName2 = dtColumns.Rows[2][0].ToString();
                                if (dtData == null)
                                {
                                    dtData = dtColumns.Clone();
                                    intNullFlag++;
                                }

                                //Filter datatable
                                var varFilteredRows = dtData.AsEnumerable();

                                if (intNullFlag == 0)
                                {
                                    varFilteredRows = dtData.AsEnumerable().Where(row => row.Field<String>(strColName) == strFolderName);
                                }

                                //Get code from MusicBrainz
                                Task<string> taskId = Task.Run(() => GetItemId(client, strFolderName));
                                taskId.Wait();
                                strID = taskId.Result;

                                //Write unregistered item
                                if (!varFilteredRows.Any() && strID != "" && strTable != "")
                                {
                                    List<string> lstCols = new List<string>();
                                    lstCols.Add(strColName);
                                    lstCols.Add(strColName2);
                                    List<string> lstVals = new List<string>();
                                    lstVals.Add(strFolderName);
                                    lstVals.Add(strID);

                                    ExtServices.InsertByTableName(strTable, lstCols, lstVals);
                                }
                                strContent += strID != "" ? "<option class='searchFilterOpt' data-value='" + strID + "' value='" + strFolderName + "'/>" : "<option class='searchFilterOpt' data-value='" + strID + "' value='" + strFolderName + " (?)'/>";
                            }
                        }
                    }

                    //Alternative names
                    DataTable dtBandsAltNames = ExtServices.GetContentByTableName("bands");

                    for (int i = 0; i < dtBandsAltNames.Rows.Count; i++)
                    {
                        string[] strNames = new string[0];
                        string[] strEnd = new string[0];

                        if (dtBandsAltNames.Rows[i][3].ToString() != "")
                        {
                            strNames = dtBandsAltNames.Rows[i][3].ToString().Split(';');
                        }

                        if (strNames != null && strNames.Length > 0){
                            foreach (string name in strNames)
                            {
                                if (strName.Length <= name.Length && name.Substring(0, strName.Length).ToLower() == strName.ToLower())
                                {
                                    strContent += dtBandsAltNames.Rows[i][2].ToString() != "" ? "<option class='searchFilterOpt' data-value='" + dtBandsAltNames.Rows[i][2].ToString() + "' value='" + name + "'/>" : "<option class='searchFilterOpt' data-value='" + dtBandsAltNames.Rows[i][2].ToString() + "' value='" + name + " (?)'/>";
                                }
                            }
                        }
                    }
                    break;
                default:
                    if (strName == "addSelectOption")
                    {
                        DataTable dtEntities = strParent == "1" ? ExtServices.GetContentByTableName("bands") : strParent == "6" ? ExtServices.GetContentByTableName("movies") : strParent == "11" ? ExtServices.GetContentByTableName("subseries") : ExtServices.GetContentByTableName("books");
                        List<string> lstValsID = new List<string>();

                        if (strTable == "countries")
                        {
                            for (int i = 0; i < dtEntities.Rows.Count; i++)
                            {
                                //List of countries of bands
                                if (!lstValsID.Contains(dtEntities.Rows[i][5].ToString().Split('[')[0]))
                                {
                                    lstValsID.Add(dtEntities.Rows[i][5].ToString().Split('[')[0]);
                                }
                            }

                            var varFilteredCountries = dtData.AsEnumerable().Where(row => lstValsID.Contains(row.Field<int>("couID").ToString()));

                            if (varFilteredCountries.Any())
                            {
                                dtData = varFilteredCountries.CopyToDataTable();
                                dtData = dtData.DefaultView.ToTable();
                            }

                            if (dtData != null && dtData.Rows.Count > 0)
                            {

                                for (int i = 0; i < dtData.Rows.Count; i++)
                                {
                                    strContent += "<option id='" + dtData.Rows[i][0].ToString() + "' class='searchFilterOpt clickFilterOpt' data-value='" + dtData.Rows[i][0].ToString() + "' value='" + dtData.Rows[i][2].ToString() + "'>" + dtData.Rows[i][4].ToString() + ";" + dtData.Rows[i][1].ToString() + ";" + dtData.Rows[i][3].ToString() + ";" + dtData.Rows[i][2].ToString() + ";" + dtData.Rows[i][0].ToString() + "</option>";
                                }
                            }
                        }

                        else
                        {
                            if (strTable == "genres")
                            {
                                dtData = ExtServices.GetContentByTableName("subgenres");
                            }
                            for (int i = 0; i < dtEntities.Rows.Count; i++)
                            {
                                string[] strGenres = dtEntities.Rows[i][10].ToString().Split(';');
                                foreach (string genre in strGenres)
                                {
                                    //List of genres of bands
                                    if (!lstValsID.Contains(genre) && genre != "")
                                    {
                                        lstValsID.Add(genre);
                                    }
                                } 
                            }
                            if (dtData != null && dtData.Rows.Count > 0)
                            {
                                var varFilteredGenres = dtData.AsEnumerable().Where(row => lstValsID.Contains(row.Field<int>("sgnID").ToString()));

                                if (varFilteredGenres.Any())
                                {
                                    dtData = varFilteredGenres.CopyToDataTable();
                                    if (strTable == "genres")
                                    {
                                        dtData.DefaultView.Sort = "sgnGenreID,sgnID";
                                    }
                                    dtData = dtData.DefaultView.ToTable();
                                }

                                for (int i = 0; i < dtData.Rows.Count; i++)
                                {
                                    strContent += "<option id='" + dtData.Rows[i][0].ToString() + "' class='searchFilterOpt clickFilterOpt' data-value='" + dtData.Rows[i][0].ToString() + "' value='" + dtData.Rows[i][1].ToString() + "'>" + dtData.Rows[i][2].ToString() + ";" + dtData.Rows[i][1].ToString() + "</option>";
                                }
                            }
                        }
                    }

                    else
                    {
                        if (dtData != null && dtData.Rows.Count > 0)
                        {
                            for (int i = 0; i < dtData.Rows.Count; i++)
                            {
                                if (dtData.Rows[i][3].ToString() != "" && strName.Length <= dtData.Rows[i][3].ToString().Length && dtData.Rows[i][3].ToString().Substring(0, strName.Length).ToLower() == strName.ToLower())
                                {
                                    strContent += dtData.Rows[i][0].ToString() != "" ? "<option class='searchFilterOpt clickFilterOpt' data-value='" + dtData.Rows[i][0].ToString() + "' value='" + dtData.Rows[i][3].ToString() + "'/>" : "";
                                }
                            }
                        }
                    }                    
                    break;
            }           

            return strContent;
        }
        /// <summary>
        /// Get TMDB Data
        /// </summary>
        /// <param name="strSeriesName"></param>
        /// <param name="sender"></param>
        /// <param name="e"></param>
        /// <returns></returns>
        public static async Task<SearchTv> GetSeriesData(string strSeriesName, string strTMBDKey)
        {
            TMDbClient client = new TMDbClient(strTMBDKey);
            client.DefaultLanguage = "en-EN"; // Get results in English

            // Search for the TV show by name
            SearchContainer<SearchTv> results = await client.SearchTvShowAsync(strSeriesName);

            // Get the first result if any exist
            SearchTv firstResult = results.Results.FirstOrDefault();

            return firstResult;
        }
        /// <summary>
        /// Method to retrieve ID of item from MusicBrainz
        /// </summary>
        /// <param name="client">Client parameter data</param>
        /// <param name="name">Name of item</param>
        /// <returns></returns>
        public static async Task<string> GetItemId(MusicBrainzClient client, string name, string strType = "")
        {
            
            if (strType == "")
            {
                var artists = await client.Artists.SearchAsync(name, 1);
                var artist = artists.Items.FirstOrDefault();
                return artist != null ? artist.Id.ToString() : "";
            }
            else
            {
                var varArea = await client.Artists.GetAsync(name, "area-rels");
                return varArea != null ? varArea.Id.ToString() : "";
            }
            
        }

        /// <summary>
        /// Method to validate ID of item from MusicBrainz
        /// </summary>
        /// <param name="client">Client parameter data</param>
        /// <param name="name">Name of item</param>
        /// <returns></returns>
        public static async Task<Artist> ValidateItemId(MusicBrainzClient client, string strCode, string strType = "")
        {
            //var artists = await client.Artists.GetAsync(name, "area-rels","artist-rels","event-rels","instrument-rels","label-rels","place-rels","recording-rels","release-rels","release-group-rels","series-rels","url-rels","work-rels");

            switch (strType)
            {
                
                case "artist":
                    var varArtist = await client.Artists.GetAsync(strCode, "aliases", "recordings", "releases", "release-groups", "works", "tags", "genres", "url-rels", "area-rels", "artist-rels", "instrument-rels");
                    return varArtist;
                    break;
                case "area":
                case "instrument":
                    var varArea = await client.Artists.GetAsync(strCode,  "area-rels");
                    return varArea;
                    break;
                default:
                     var varData = await client.Artists.GetAsync(strCode, "aliases", "recordings", "releases", "release-groups", "works", "tags", "genres", "url-rels", "area-rels", "artist-rels", "instrument-rels");
                    return varData;
                    break;
            }
            
        }

        [System.Web.Services.WebMethod]
        public static string DisplayContent(string strOption = "", string strID = "", string strTable = "", string strDataType = "list", string strViewMode = "H", string strCurColor = "")
        {
            string strContent = "";
            DataTable dtData = new DataTable();
            if (strOption == "personnel")
            {
                DataTable dtOptionTypes = GetContentByTableName("participationtypes");
                DataTable dtBand = GetRecordByValue("bands", "bndName", HttpContext.Current.Session["curArtistName"].ToString());
                string strBandID = "";
                if (dtBand != null && dtBand.Rows.Count > 0)
                {
                    strBandID = dtBand.Rows[0][0].ToString();
                }

                strID = strID == "0" ? "1" : strID == "1" ? "0" : strID;

                //Get participations based on artist ID and strID
                DataTable dtParticipations = ExtServices.GetRecordLikeTwoValues("artistparticipations", "arpFKbands", strBandID, "arpFKparticipationtypes", strID, "arpFKartists", "ASC");
                if (dtParticipations == null)
                {
                    strID = strID == "0" ? "1" : strID == "1" ? "0" : strID;
                    dtParticipations = ExtServices.GetRecordLikeTwoValues("artistparticipations", "arpFKbands", strBandID, "arpFKparticipationtypes", strID, "arpFKartists", "ASC");
                }
                dtData = dtParticipations;

                if (dtData != null && dtData.Rows.Count > 0)
                {
                    string strValues = "";
                    for (int i = 0; i < dtData.Rows.Count; i++)
                    {
                        strValues = strValues == "" ? dtData.Rows[i][2].ToString() : strValues + "," + dtData.Rows[i][2].ToString();

                        //Get instruments
                        if (dtData.Rows[i][6].ToString() != "")
                        {
                            string strInstrumentList = dtData.Rows[i][6].ToString().Replace(";", ",");
                            DataTable dtInstruments = ExtServices.GetRecordByValueList("instruments", "insID", strInstrumentList, "insID", "DESC");
                            string strInstrumentNames = "";
                            if (dtInstruments != null && dtInstruments.Rows.Count > 0)
                            {
                                for (int j = 0; j < dtInstruments.Rows.Count; j++)
                                {
                                    strInstrumentNames = strInstrumentNames == "" ? dtInstruments.Rows[j][1].ToString() : strInstrumentNames + "⠀•⠀" + dtInstruments.Rows[j][1].ToString();

                                }
                                dtData.Rows[i][6] = strInstrumentNames;
                            }
                        }
                    }
                    //Get artists
                    DataTable dtArtists = ExtServices.GetRecordByValueList("artists", "artID", strValues, "artID");
                    if (dtArtists != null && dtArtists.Rows.Count > 0)
                    { 
                        //Get google keys to look for images
                        DataTable dtGoogleAuth = ExtServices.GetRecordByValue("apiauth", "apiName", "Google");
                        string strSearchTerm = "";
                        string strName = "";
                        string strRoles = "";

                        int intTopMargin = 5;
                        int intSideMargin = 65;
                        int intSize = 200;
                        int intOddIndex = 0;
                        int intFirstItem = 0;

                        switch (dtArtists.Rows.Count)
                        {
                            case 1:
                                intTopMargin = 80;
                                intSideMargin = 515;
                                intSize = 350;
                                break;
                            case 2:
                                intTopMargin = 115;
                                intSideMargin = 190;
                                intSize = 300;
                                break;
                            case 3:
                                intTopMargin = 130;
                                intSideMargin = 103;
                                intSize = 250;
                                break;
                            case 4:
                                intTopMargin = 150;
                                intSideMargin = 65;
                                intSize = 200;
                                break;
                            case 5:
                                intTopMargin = 10;
                                intSideMargin = 103;
                                intSize = 250;
                                intOddIndex = 5;
                                break;
                            case 6:
                                intTopMargin = 10;
                                intSideMargin = 103;
                                intSize = 250;
                                break;
                            case 7:
                                intTopMargin = 10;
                                intSideMargin = 65;
                                intSize = 200;
                                intOddIndex = 7;
                                break;
                            case 8:
                                intTopMargin = 10;
                                intSideMargin = 65;
                                intSize = 200;
                                break;
                            case 9:
                                intTopMargin = 40;
                                intSideMargin = 60;
                                intSize = 150;
                                intOddIndex = 9;
                                break;
                            case 10:
                                intTopMargin = 40;
                                intSideMargin = 60;
                                intSize = 150;
                                break;
                            case 11:
                                intTopMargin = 40;
                                intSideMargin = 50;
                                intSize = 125;
                                intOddIndex = 11;
                                break;
                            case 12:
                                intTopMargin = 40;
                                intSideMargin = 50;
                                intSize = 125;
                                break;
                            default:
                                intTopMargin = 20;
                                intSideMargin = 50;
                                intSize = 125;
                                break;

                        }

                        for (int i = 0; i < dtArtists.Rows.Count; i++)
                        {
                            string strPeriod = "";
                            string strImageURL = "/Images/System/" + "poster_H.jpg";
                            char charCurInitial = dtArtists.Rows[i][3].ToString().ToUpper()[0];
                            charCurInitial = Char.IsDigit(charCurInitial) ? '#' : Char.IsSymbol(charCurInitial) ? '' : charCurInitial;
                            //If file doesn't contain ID then rename file
                            if (File.Exists(HttpContext.Current.Server.MapPath("~/Images/Artists/" + charCurInitial + "/") + dtArtists.Rows[i][3].ToString() + ".jpg"))
                            {
                                File.Move(HttpContext.Current.Server.MapPath("~/Images/Artists/" + charCurInitial + "/") + dtArtists.Rows[i][3].ToString() + ".jpg", HttpContext.Current.Server.MapPath("~/Images/Artists/") + dtArtists.Rows[i][3].ToString() + " (" + dtArtists.Rows[i][1].ToString() + ").jpg");
                            }

                            //If file contains ID
                            if (File.Exists(HttpContext.Current.Server.MapPath("~/Images/Artists/" + charCurInitial + "/") + dtArtists.Rows[i][3].ToString() + " ("+ dtArtists.Rows[i][1].ToString() + ").jpg"))
                            {
                                strImageURL = "/Images/Artists/" + charCurInitial + "/" + Uri.EscapeDataString(dtArtists.Rows[i][3].ToString() + " (" + dtArtists.Rows[i][1].ToString() + ").jpg");
                            }

                            else {
                                //strSearchTerm = dtArtists.Rows[i][3].ToString() + " " + HttpContext.Current.Session["curArtistName"] + " latest";
                                //List<SearchResult> lstGoogleSearch = GoogleFetchImages(dtGoogleAuth, strSearchTerm);
                                //strImageURL = lstGoogleSearch != null ? lstGoogleSearch[0].Link : strImageURL;
                            }

                            if (strImageURL != "")
                            {
                                strName = "<a href='javascript:void(0)' id = 'LogoSpan" + i + "' class = 'artistRef coloredText logo_span logo_span_" + strViewMode + " divContentSpan' data-name='" + dtArtists.Rows[i][3].ToString().Replace(";", "⠀•⠀") + "'  style='font-weight:600; display:inline-block;text-decoration:none;color:" + strCurColor + "'>" + dtArtists.Rows[i][3].ToString() + "</a>";
                                strRoles = "<span class = 'icon_span icon_span_" + strViewMode + " divContentSpan' data-name='" + dtData.Rows[i][6].ToString().Replace(";", "⠀•⠀") + "'>" + dtData.Rows[i][6].ToString().Replace(";", "⠀•⠀") + "</span>";

                                //Period
                                if (dtData.Rows[i][3].ToString() != "")
                                {
                                    
                                    string[] strStartDates = dtData.Rows[i][3].ToString().Split(';');

                                    //If never splitted
                                    if (dtData.Rows[i][4].ToString() == "")
                                    {
                                        strPeriod = strStartDates[0].Substring(0, 4) + "–Present";
                                    }

                                    else
                                    { 
                                        string[] strEndDates = dtData.Rows[i][4].ToString().Split(';');
                                        int intCountPeriod = 0;

                                        for (int j = 0; j < strStartDates.Length; j++)
                                        {
                                            // If ever splitted but active
                                            if (strStartDates.Length > strEndDates.Length)
                                            {
                                                if (j < strEndDates.Length)
                                                {
                                                    strPeriod = intCountPeriod == 0 ? strPeriod + strStartDates[j].Substring(0, 4) + "–" + strEndDates[j].Substring(0, 4) : strPeriod + "⠀•⠀" + strStartDates[j].Substring(0, 4) + "–" + strEndDates[j].Substring(0, 4);
                                                }
                                                else
                                                {
                                                    strPeriod = intCountPeriod == 0 ? strPeriod + strStartDates[j].Substring(0, 4) + "–Present" : strPeriod + "⠀•⠀" + strStartDates[j].Substring(0, 4) + "–Present";
                                                }
                                            }
                                            //if splitted
                                            else
                                            {
                                                strPeriod = intCountPeriod == 0 ? strPeriod + strStartDates[j].Substring(0, 4) + "–" + strEndDates[j].Substring(0, 4) : strPeriod + "⠀•⠀" + strStartDates[j].Substring(0, 4) + "–" + strEndDates[j].Substring(0, 4);
                                            }
                                            intCountPeriod++;
                                        }
                                    }
                                }

                                strPeriod = "<span id = 'iconSpan" + i + "' class = 'icon_span icon_span_" + strViewMode + " divContentSpan' data-name='" + dtArtists.Rows[i][2].ToString() + "'><p style='display:inline-block'>" + strPeriod + "</p></span>";

                                //Validate second row for odd number of members
                                if (intOddIndex != 0 && i > (intOddIndex/2))
                                {
                                    switch (intOddIndex)
                                    {                                        
                                        case 5:
                                            intSideMargin = 285 - intFirstItem;
                                            intFirstItem = 285;
                                            break;
                                        case 7:
                                            intSideMargin = 128;
                                            break;
                                        case 9:
                                            intSideMargin = 95;
                                            break;
                                        case 11:
                                            intSideMargin = 80;
                                            break;
                                        default:
                                            intSideMargin = 65;
                                            break;
                                    }
                                }

                                strContent += "<div class='itemBox item_container item_container_" + strViewMode + "' style='margin-bottom:-6px;display: inline-block; padding-top: " + intTopMargin + "px;padding-right:" + intSideMargin + "px;padding-left:" + intSideMargin + "px' data-id='" + dtArtists.Rows[i][0] + " 'data-code='" + dtArtists.Rows[i][1].ToString() + "' data-name='" + dtArtists.Rows[i][2].ToString() + "'>" +
                                "<div id= 'itemDiv" + i + "' class= 'button_item_" + strViewMode + " divContentItem" + i + " divArtistPhoto' data-id='" + dtArtists.Rows[i][0] + "' data-name='" + dtArtists.Rows[i][2] + "' data-code='" + dtArtists.Rows[i][1] + "'" +
                                "title='" + dtArtists.Rows[i][2].ToString() + "' style='background-image:url(" + strImageURL +
                                "); background-size:cover; background-position:center top;max-width: " + intSize + "px;min-height: " + intSize + "px;border-radius: 50%'></div><div class='spanArtistContainer' style='width:" + intSize + "px;position: relative;text-align: center;margin-top:15px'>"
                                + strName + "<br/> "+ strRoles + "<br/>" + strPeriod + "</div></div>";
                            }
                        }
                        //Depending of the chosen option display content
                        switch (strID)
                        {
                            case "0": //Official
                                break;
                            case "1": //Original
                                break;
                            case "2": //Touring
                                break;
                            case "3": //Former
                                break;
                            case "4": //Other
                                break;
                            case "5": //Related
                                break;
                            default:
                                break;
                        }
                    }

                }
            }
            else if (strOption == "links")
            {
                //Get News
                //DataTable dtKeys = ExtServices.GetRecordByValue("apiauth", " apiName", "News API");

                //var newsApiClient = new NewsApiClient(dtKeys.Rows[0][2].ToString());
                //string strNews= GetArtistNews(newsApiClient, HttpContext.Current.Session["curArtistName"].ToString());
                //Get links

                dtData = GetRecordByValue(strTable, "wstID", strID);
                DataTable dtBand = GetRecordByValue("bands", "bndName", HttpContext.Current.Session["curArtistName"].ToString());
                string strBandLinks = dtBand.Rows[0][12].ToString() != "" ? dtBand.Rows[0][12].ToString() : "" ;
                string strContents = "";
                int intCountElements = Regex.Matches(strBandLinks, Regex.Escape(" ("+ dtData.Rows[0][0].ToString() + ")■")).Count;
                int intElementCounter = 0;
                string strSeparator = intCountElements < 8 ? "<br>" : "";
                string strMargin = intCountElements < 8 ? "-110%" : "-110%";
                string strHeight = intCountElements < 8 ? "160px" : "80px";
                string strWidth = intCountElements < 8 ? "400px" : "200px";
                string strTop = "";

                if (intCountElements == 0)
                {
                    strTop = "0";
                }

                else if (intCountElements < 6)
                {
                    strTop = 45 / intCountElements + "%";
                }

                if (strBandLinks != "")
                {
                    string[] strURLs = strBandLinks.Split(';');
                    Array.Sort(strURLs);
                    strContents = strContents + "<div id='Website_" + dtData.Rows[0][1].ToString() + "' class='websiteDiv container' style='float:right;margin-right: "+ strMargin + ";margin-top: "+ strTop + "'><div class='row'><div class='col-12 divLinksSub'>";

                    foreach (string url in strURLs)
                    {
                        if (url.Contains(" (" + dtData.Rows[0][0].ToString() + ")"))
                        {
                            string strCurrName = url.Split('■')[0].Replace(" (" + dtData.Rows[0][0].ToString() + ")", "").Replace("■", "").Replace("[", "").Replace("]", "");
                            string strCurrUrl = url.Split('■')[1].Replace(" (" + dtData.Rows[0][0].ToString() + ")", "").Replace("■", "").Replace("[", "").Replace("]", "");
                            string strImgPath = strCurrName != "Official Website" ? "/Images/Websites/" + strCurrName + ".png" : "/Images/Websites/" + strCurrName + ".png";
                            strContents = strContents + "<a target='_blank' href='" + strCurrUrl + "' title='" + strCurrName + "'><img class='imgArtistLink' src='" + strImgPath + "' +' style='padding:15px;max-width:"+ strWidth + ";max-height:"+ strHeight + ";'></a>"+ strSeparator + "";

                            if (intCountElements > 7 && intElementCounter % 2 == 0)
                            {
                                strSeparator = "<br>";
                            }

                            else if (intCountElements > 7 && intElementCounter % 2 != 0)
                            {
                                strSeparator = "";
                            }

                            intElementCounter++;
                        }
                    }
                    strContents = strContents + "</div></div></div>";                  
                }
                strContent = strContents;
            }
            else
            {
                //Sync directories
                switch (HttpContext.Current.Session["curPageName"].ToString())
                {
                    case "Music":
                        if (strTable.Contains("cust_releases"))
                        {
                            dtData = ExtServices.GetDistinctRecordByValue("relFKbands", "releases", "relFKcompanies", strOption, "=", "relFKbands");
                            List<string> lstVals = new List<string>();
                            if (dtData != null && dtData.Rows.Count > 0)
                            {
                                for (int i = 0; i < dtData.Rows.Count; i++)
                                {
                                    lstVals.Add(dtData.Rows[i][0].ToString());
                                }
                                if (lstVals.Count > 0)
                                {
                                    string strBandsId = string.Join(",", lstVals);
                                    dtData = ExtServices.GetRecordByValueList("bands", "bndID", strBandsId);
                                }
                            }
                        }
                        else if (strTable.Contains("cust_producers"))
                        {
                            DataTable dtProdData = ExtServices.GetRecordByValue("artists", "artStageName", strOption, "artID");
                            if (dtProdData != null && dtProdData.Rows.Count > 0)
                            {
                                dtData = ExtServices.GetDistinctRecordByValue("relFKbands", "releases", "relFKartists", dtProdData.Rows[0][0].ToString(), "=", "relFKbands");
                                List<string> lstVals = new List<string>();
                                if (dtData != null && dtData.Rows.Count > 0)
                                {
                                    for (int i = 0; i < dtData.Rows.Count; i++)
                                    {
                                        lstVals.Add(dtData.Rows[i][0].ToString());
                                    }
                                    if (lstVals.Count > 0)
                                    {
                                        string strBandsId = string.Join(",", lstVals);
                                        dtData = ExtServices.GetRecordByValueList("bands", "bndID", strBandsId);
                                    }
                                }
                            }
                        }
                        else
                        {
                            dtData = HttpContext.Current.Session["fullArtistTable"] != null ? HttpContext.Current.Session["fullArtistTable"] as DataTable : ExtServices.GetContentByTableName("bands");
                        }
                        break;
                    default:
                        SyncFolders(strTable);
                        dtData = strTable != "" ? ExtServices.GetContentByTableName(strTable) : new DataTable();
                        break;
                }

                //Look for entries in database
                string strColName = dtData != null ? dtData.Columns[1].ColumnName : "";
                DataTable tblFiltered = new DataTable();
                string strFilterText = "";
                strOption = strTable == "enddate" && strOption == "All" ? "AllEnd" : strOption;
                switch (strOption)
                {
                    case "All":
                        //Get all items from database
                        tblFiltered = dtData.Copy();

                        tblFiltered.DefaultView.Sort = strColName;
                        tblFiltered = tblFiltered.DefaultView.ToTable();
                        break;
                    case "#":
                        //Get items starting with numbers
                        if (strOption.Length == 1 && strColName != "" && dtData != null)
                        {
                            strFilterText = "0123456789";
                            var varFilteredRows = dtData.AsEnumerable().Where(row => strFilterText.Contains((row.Field<string>(strColName) ?? " ").ToUpper().First<char>())).Distinct();

                            if (varFilteredRows.Any())
                            {
                                tblFiltered = varFilteredRows.CopyToDataTable();

                                tblFiltered.DefaultView.Sort = strColName;
                                tblFiltered = tblFiltered.DefaultView.ToTable();
                            }
                        }
                        break;
                    case "•":
                        //Get items starting with a special character
                        if (strOption.Length == 1 && strColName != "" && dtData != null)
                        {
                            strFilterText = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
                            var varFilteredRows = dtData.AsEnumerable().Where(row => !strFilterText.Contains((row.Field<string>(strColName) ?? " ").ToUpper().First<char>())).Distinct();

                            if (varFilteredRows.Any())
                            {
                                tblFiltered = varFilteredRows.CopyToDataTable();

                                tblFiltered.DefaultView.Sort = strColName;
                                tblFiltered = tblFiltered.DefaultView.ToTable();
                            }
                        }
                        break;
                    default:
                        //If option is a letter
                        if (strOption.Length == 1 && strColName != "" && dtData != null)
                        {
                            var varFilteredRows = dtData.AsEnumerable().Where(row => strOption.Contains((row.Field<string>(strColName) ?? " ").ToUpper().First<char>())).Distinct();
                            if (varFilteredRows.Any())
                            {
                                tblFiltered = varFilteredRows.CopyToDataTable();
                                tblFiltered.DefaultView.Sort = strColName;
                                tblFiltered = tblFiltered.DefaultView.ToTable();
                            }
                        }

                        else
                        {
                            //If option belongs to a list of items 
                            if (strDataType == "list")
                            {
                                switch (strTable)
                                {
                                    case "continents":
                                        DataTable dtCountries = ExtServices.GetContentByTableName("countries");
                                        var varFiltCountries = dtCountries.AsEnumerable().Where(row => Convert.ToInt32(strID) == row.Field<int>("couContinentID"));

                                        if (varFiltCountries.Any())
                                        {
                                            tblFiltered = varFiltCountries.CopyToDataTable();
                                            tblFiltered = tblFiltered.DefaultView.ToTable();

                                            List<string> lstValsID = new List<string>();

                                            for (int i = 0; i < tblFiltered.Rows.Count; i++)
                                            {
                                                lstValsID.Add(tblFiltered.Rows[i][0].ToString());
                                            }

                                            for (int j = 0; j < dtData.Rows.Count; j++)
                                            {
                                                dtData.Rows[j][5] = dtData.Rows[j][5].ToString().Split('[')[0];
                                            }

                                            var varFilteredBands = dtData.AsEnumerable().Where(row => lstValsID.Contains(row.Field<string>("bndFKcountries")));

                                            if (varFilteredBands.Any())
                                            {
                                                tblFiltered = varFilteredBands.CopyToDataTable();

                                                tblFiltered.DefaultView.Sort = "bndName";
                                                tblFiltered = tblFiltered.DefaultView.ToTable();
                                            }

                                            else
                                            {
                                                tblFiltered = new DataTable();
                                            }
                                        }
                                        break;
                                    case "startdate":
                                        DataTable dtBands = ExtServices.GetContentByTableName("bands");
                                        strOption = strOption.Replace("'s", "");

                                        for (int i = 0; i < dtBands.Rows.Count; i++)
                                        {
                                            if (dtBands.Rows[i][6].ToString() != "")
                                            {
                                                string strDate = dtBands.Rows[i][6].ToString().Substring(0, 4);
                                                dtBands.Rows[i][6] = strDate;
                                            }
                                        }

                                        var varFiltBandStart = dtBands.AsEnumerable().Where(row => Convert.ToInt32(strOption) <= Convert.ToInt32(row.Field<string>("bndStartingDates")) && Convert.ToInt32(strOption) + 9 >= Convert.ToInt32(row.Field<string>("bndStartingDates")));

                                        if (varFiltBandStart.Any())
                                        {
                                            tblFiltered = varFiltBandStart.CopyToDataTable();
                                            tblFiltered.DefaultView.Sort = "bndName";
                                            tblFiltered = tblFiltered.DefaultView.ToTable();
                                        }
                                        else
                                        {
                                            tblFiltered = new DataTable();
                                        }
                                        break;
                                    case "enddate":
                                        DataTable dtBandsEnd = ExtServices.GetContentByTableName("bands");

                                        List<string> lstValsYearsEnd = new List<string>();
                                        strOption = strOption != "AllEnd" ? strOption.Replace("'s", "") : strOption;

                                        for (int i = 0; i < dtBandsEnd.Rows.Count; i++)
                                        {
                                            string[] strBegin = new string[0];
                                            string[] strEnd = new string[0];

                                            if (dtBandsEnd.Rows[i][6].ToString() != "")
                                            {
                                                strBegin = dtBandsEnd.Rows[i][6].ToString().Split(';');
                                            }

                                            if (dtBandsEnd.Rows[i][7].ToString() != "")
                                            {
                                                strEnd = dtBandsEnd.Rows[i][7].ToString().Split(';');
                                                dtBandsEnd.Rows[i][7] = strEnd.Last().Substring(0, 4);
                                            }

                                            if (strBegin.Length == strEnd.Length && strBegin.Length > 0 && strEnd.Length > 0 && Convert.ToInt32(strBegin.Last().Substring(0, 4)) <= Convert.ToInt32(strEnd.Last().Substring(0, 4)) && !lstValsYearsEnd.Contains(strEnd.Last().Substring(0, 4)) && !lstValsYearsEnd.Contains(dtBandsEnd.Rows[i][0].ToString()))
                                            {
                                                lstValsYearsEnd.Add(dtBandsEnd.Rows[i][0].ToString());
                                            }
                                        }

                                        var varFiltBandEnd = dtBandsEnd.AsEnumerable().Where(row => lstValsYearsEnd.Contains(row.Field<int>("bndID").ToString()));

                                        if (strOption != "AllEnd")
                                        {
                                            varFiltBandEnd = varFiltBandEnd.Where(row => Convert.ToInt32(strOption) <= Convert.ToInt32(row.Field<string>("bndEndingDates")) && Convert.ToInt32(strOption) + 9 >= Convert.ToInt32(row.Field<string>("bndEndingDates")));
                                        }

                                        if (varFiltBandEnd.Any())
                                        {
                                            tblFiltered = varFiltBandEnd.CopyToDataTable();
                                            tblFiltered.DefaultView.Sort = "bndName";
                                            tblFiltered = tblFiltered.DefaultView.ToTable();
                                        }
                                        else
                                        {
                                            tblFiltered = new DataTable();
                                        }
                                        break;
                                    case "genders":
                                        DataTable dtArtists = ExtServices.GetRecordByValue("artists", "artFKgenders", strID);
                                        DataTable dtArtPart = ExtServices.GetContentByTableName("artistparticipations");

                                        List<string> lstArtistID = new List<string>();

                                        if (dtArtists != null && dtArtists.Rows.Count > 0)
                                        {
                                            for (int i = 0; i < dtArtists.Rows.Count; i++)
                                            {
                                                lstArtistID.Add(dtArtists.Rows[i][0].ToString());
                                            }
                                        }

                                        if (lstArtistID.Count > 0)
                                        {
                                            var varFilterGender = dtArtPart.AsEnumerable().Where(row => lstArtistID.Contains(row.Field<int>("arpFKartists").ToString()));
                                            if (varFilterGender.Any())
                                            {
                                                tblFiltered = varFilterGender.CopyToDataTable();
                                                tblFiltered = tblFiltered.DefaultView.ToTable();

                                                List<string> lstBandID = new List<string>();

                                                for (int i = 0; i < tblFiltered.Rows.Count; i++)
                                                {
                                                    lstBandID.Add(tblFiltered.Rows[i][1].ToString());

                                                    if (tblFiltered.Rows[i][6].ToString().Contains("1016"))
                                                    {
                                                        tblFiltered.Rows[i][6] = "1016";
                                                    }
                                                }

                                                varFilterGender = tblFiltered.AsEnumerable().Where(row => row.Field<string>("artFKinstruments") == "1016");

                                                if (varFilterGender.Any())
                                                {
                                                    tblFiltered = varFilterGender.CopyToDataTable();
                                                    tblFiltered = tblFiltered.DefaultView.ToTable();

                                                    lstArtistID = new List<string>();

                                                    for (int i = 0; i < tblFiltered.Rows.Count; i++)
                                                    {
                                                        if (!lstArtistID.Contains(tblFiltered.Rows[i][1].ToString()))
                                                        {
                                                            lstArtistID.Add(tblFiltered.Rows[i][1].ToString());
                                                        }
                                                    }

                                                    varFilterGender = dtData.AsEnumerable().Where(row => lstArtistID.Contains(row.Field<int>("bndID").ToString()));
                                                    if (varFilterGender.Any())
                                                    {
                                                        tblFiltered = varFilterGender.CopyToDataTable();
                                                        tblFiltered.DefaultView.Sort = "bndName";
                                                        tblFiltered = tblFiltered.DefaultView.ToTable();
                                                    }
                                                    else
                                                    {
                                                        tblFiltered = new DataTable();
                                                    }
                                                }
                                            }
                                            else
                                            {
                                                tblFiltered = new DataTable();
                                            }
                                        }

                                        break;
                                    default:
                                        var varFilteredRows = dtData.AsEnumerable().Where(row => strID == row.Field<string>("bndFK" + strTable));

                                        if (varFilteredRows.Any())
                                        {
                                            tblFiltered = varFilteredRows.CopyToDataTable();

                                            tblFiltered.DefaultView.Sort = strColName;
                                            tblFiltered = tblFiltered.DefaultView.ToTable();
                                        }
                                        else
                                        {
                                            tblFiltered = new DataTable();
                                        }
                                        break;
                                }

                            }
                            else if (strDataType == "select" && !strTable.Contains("cust_"))
                            {
                                switch (strTable)
                                {
                                    case "countries":

                                        for (int j = 0; j < dtData.Rows.Count; j++)
                                        {
                                            dtData.Rows[j][5] = dtData.Rows[j][5].ToString().Split('[')[0];
                                        }

                                        var varFilteredBands = dtData.AsEnumerable().Where(row => strID == row.Field<string>("bndFKcountries"));

                                        if (varFilteredBands.Any())
                                        {
                                            tblFiltered = varFilteredBands.CopyToDataTable();

                                            tblFiltered.DefaultView.Sort = "bndName";
                                            tblFiltered = tblFiltered.DefaultView.ToTable();
                                        }

                                        else
                                        {
                                            tblFiltered = new DataTable();
                                        }
                                        break;
                                    case "genres":
                                        DataTable dtSubgenres = ExtServices.GetContentByTableName("subgenres");

                                        List<string> lstValsID = new List<string>();

                                        for (int i = 0; i < dtData.Rows.Count; i++)
                                        {
                                            if (dtData.Rows[i][10].ToString().Contains(strID))
                                            {
                                                lstValsID.Add(dtData.Rows[i][10].ToString());
                                            }
                                        }

                                        var varFilteredSubgenre = dtData.AsEnumerable().Where(row => lstValsID.Contains(row.Field<string>("bndFKsubgenres")));

                                        if (varFilteredSubgenre.Any())
                                        {
                                            tblFiltered = varFilteredSubgenre.CopyToDataTable();

                                            tblFiltered.DefaultView.Sort = "bndName";
                                            tblFiltered = tblFiltered.DefaultView.ToTable();
                                        }

                                        else
                                        {
                                            tblFiltered = new DataTable();
                                        }
                                        break;
                                    default:
                                        break;
                                }


                            }
                            // If option belongs to searched item from datalist
                            else if (strTable.Contains("cust_"))
                            {
                                tblFiltered = dtData;
                            }
                            else if (strTable == "reproductions")
                            {
                                DataTable dtContent = new DataTable();
                                DataTable dtArtistReproductions = ExtServices.CountIterationsByValue("reproductions", " repArtistID", "repPlays", "repArtistID", "repPlays", "DESC");
                                if (dtArtistReproductions != null && dtArtistReproductions.Rows.Count > 0)
                                {
                                    string strBandIDs = "";
                                    int intCountArtists = dtArtistReproductions.Rows.Count >= 30 ? 30 : dtArtistReproductions.Rows.Count;
                                    for (int i = 0; i < intCountArtists; i++)
                                    {
                                        strBandIDs = strBandIDs == "" ? dtArtistReproductions.Rows[i][0].ToString() : strBandIDs + "," + dtArtistReproductions.Rows[i][0].ToString();
                                    }
                                    if (strBandIDs != "")
                                    {
                                        dtContent = ExtServices.GetRecordByValueList("bands", "bndID", strBandIDs);
                                    }
                                }
                                tblFiltered = dtContent;
                            }
                            else
                            {
                                // get data from artistparticipations
                                DataTable dtArtPart = ExtServices.GetContentByTableName("artistparticipations");


                                if (strTable == "artists")
                                {
                                    var varFilteredRows = dtArtPart.AsEnumerable().Where(row => Convert.ToInt32(strID) == row.Field<int>("arpFK" + strTable));

                                    if (varFilteredRows.Any())
                                    {
                                        tblFiltered = varFilteredRows.CopyToDataTable();
                                        tblFiltered = tblFiltered.DefaultView.ToTable();

                                        List<string> lstValsID = new List<string>();

                                        for (int i = 0; i < tblFiltered.Rows.Count; i++)
                                        {
                                            lstValsID.Add(tblFiltered.Rows[i][1].ToString());
                                        }

                                        var varFilteredBands = dtData.AsEnumerable().Where(row => lstValsID.Contains(row.Field<int>("bndID").ToString()));

                                        if (varFilteredBands.Any())
                                        {
                                            tblFiltered = varFilteredBands.CopyToDataTable();

                                            tblFiltered.DefaultView.Sort = "bndName";
                                            tblFiltered = tblFiltered.DefaultView.ToTable();
                                        }
                                        else
                                        {
                                            tblFiltered = new DataTable();
                                        }
                                    }
                                }
                                //bands table
                                else
                                {
                                    DataTable dtBand = ExtServices.GetContentByTableName("bands");
                                    var varFilteredRows = dtBand.AsEnumerable().Where(row => strID == row.Field<string>("bndCode"));

                                    if (varFilteredRows.Any())
                                    {
                                        tblFiltered = varFilteredRows.CopyToDataTable();
                                        tblFiltered.DefaultView.Sort = "bndName";
                                        tblFiltered = tblFiltered.DefaultView.ToTable();

                                    }

                                    else
                                    {
                                        tblFiltered = new DataTable();
                                    }
                                }
                            }
                        }
                        break;
                }

                //For each item found add new item
                strContent = strGridContent(tblFiltered, strViewMode, strTable, strContent);                
            }
            
            return strContent;
        }

        [System.Web.Services.WebMethod]
        public static string DisplayFilterContent(string strFilterId, string strContentType)
        {
            string strHTML = "";

            switch (strFilterId)
            {
                case "2":
                    //Playlists
                    DataTable dtPlaylistData = ExtServices.GetDistinctRecordByValue("pldPlaylist", "playlistData", "pldPlaylist", "0", "!=", "pldPlaylist");
                    if (dtPlaylistData != null && dtPlaylistData.Rows.Count > 0)
                    {
                        List<string> lstVals = new List<string>();
                        for (int i = 0; i < dtPlaylistData.Rows.Count; i++)
                        {
                            lstVals.Add(dtPlaylistData.Rows[i][0].ToString());
                        }
                        //Most played
                        lstVals.Add("17");
                        if (lstVals.Count > 0)
                        {
                            List<string> lstUniqueIDs = lstVals.Distinct().ToList();
                            string strPlaylistIDs = string.Join(",", lstUniqueIDs);
                            DataTable dtData = ExtServices.GetRecordByValueList("playlists", "plaID", strPlaylistIDs);
                            if (dtData != null && dtData.Rows.Count > 0)
                            {
                                strHTML = strGridContent(dtData, "V", "playlists", "");
                            }
                        }
                    }
                    break;
                case "3":
                    //Your Activity
                    break;
                case "4":
                    //Releases
                    break;
                case "0":
                    //Home
                    //strHTML = await GetDashboardHtmlAsync();
                    //strHTML = strDashboardContent();
                    break;
                default:
                    break;
            }
            return strHTML;
        }
        public static string strDashboardContent()
        {
            string strHTML = "";

            strHTML = "<div class='containerDiv'>" + 
                "<div class='panelDiv'><h3>LATEST RELEASES</h3></div>"+
                "<div class='panelDiv'><h3>UPCOMING RELEASES</h3></div>"+
                "<div class='panelDiv'><h3>UPCOMING EVENTS</h3></div>"+
                "<div class='panelDiv'><h3>MOST PLAYED</h3></div></div>";
            return strHTML;
        }

        public static string strGridContent(DataTable tblFiltered, string strViewMode, string strTable, string strContent, Dictionary<string, string> dicArtistPart = null, string strPageName = "")
        {
            string strNotFound = "";
            strPageName = strPageName == "" ? HttpContext.Current.Session["curPageName"].ToString() : strPageName;
            if (strTable.Contains("OtherProjects") && strContent != "")
            {
                strNotFound = strContent;
                strContent = "";
            }
            if (tblFiltered != null && tblFiltered.Rows.Count > 0)
            {
                for (int i = 0; i < tblFiltered.Rows.Count; i++)
                {
                    string strPosterPath = "";
                    string strPosterPathLocal = "";
                    string strLogoPath = "";
                    string strIconPath = "";
                    string strTitleTag = "";
                    string strLogoTag = "";
                    string strIconTag = "";
                    int intPhotoYear = 0;
                    char charInitialChar = Char.IsDigit(tblFiltered.Rows[i][1].ToString().ToUpper()[0]) ? '#' : Char.IsSymbol(tblFiltered.Rows[i][1].ToString().ToUpper()[0]) ? '' : tblFiltered.Rows[i][1].ToString().ToUpper()[0];
                    string strAdditionalClass = Directory.Exists(HttpContext.Current.Session["currentDisk"].ToString() + "/" + strPageName + "/" + charInitialChar + "/" + tblFiltered.Rows[i][1].ToString()) ? "ItemFound" : "ItemNotFound";

                    //Look for posters
                    //If directory exists
                    if (Directory.Exists(HttpContext.Current.Session["currentDisk"].ToString() +"/" + strPageName + "/" + charInitialChar + "/" + tblFiltered.Rows[i][1].ToString() + "/Gallery/Photos"))
                    {
                        string[] strPosterNames = Directory.GetFiles(HttpContext.Current.Session["currentDisk"].ToString() + "/" + strPageName + "/" + charInitialChar + "/" + tblFiltered.Rows[i][1].ToString() + "/Gallery/Photos");
                        Array.Sort(strPosterNames);
                        strPosterNames = strPosterNames.Where(val => val.Contains("_" + strViewMode + ".")).ToArray();

                        if (strPosterNames.Length > 0)
                        {
                            Random r = new Random();
                            int rInt = r.Next(0, strPosterNames.Count());
                            intPhotoYear = Convert.ToInt32(Path.GetFileName(strPosterNames[rInt]).ToString().Substring(0, 4));
                            strPosterPath = strPosterNames.Count() > 0 ? strPosterNames[rInt].ToString().Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/", "http://127.0.0.1:8887/").Replace(" ", "%20").Replace("\\", "/").Replace("'", "%27") : "";
                            strPosterPathLocal = strPosterNames.Count() > 0 ? strPosterNames[rInt].ToString() : "";
                        }
                    }

                    if (tblFiltered.Columns.Count>5)
                    {
                        string outputPath = "";
                        if (strPosterPathLocal.Contains("_small"))
                        {
                            outputPath = strPosterPathLocal != "" ? strPosterPathLocal : HttpContext.Current.Server.MapPath("~/Images/System/poster_" + strViewMode + ".jpg") ;
                        }
                        else
                        {
                            outputPath = strPosterPathLocal != "" ? strPosterPathLocal + "_small.jpg" : HttpContext.Current.Server.MapPath("~/Images/System/poster_" + strViewMode + ".jpg") + "_small.jpg";
                        }
                        
                        if (strPosterPath != "")
                        {
                            string strPosterPath1 = File.Exists(outputPath.Replace("_V.", "_H.")) ? outputPath.Replace("_V.", "_H.") : SecondaryPage.ResizeImage(strPosterPath.Replace("_V.", "_H.").Replace("http://127.0.0.1:8887", "").Replace("%20", " ").Replace("/", "\\").Replace("%27", "'"), outputPath.Replace("_V.", "_H."), 3, false);
                            string strPosterPath2 = File.Exists(outputPath.Replace("_H.", "_V.")) ? outputPath.Replace("_H.", "_V.") : SecondaryPage.ResizeImage(strPosterPath.Replace("_H.", "_V.").Replace("http://127.0.0.1:8887", "").Replace("%20", " ").Replace("/", "\\").Replace("%27", "'"), outputPath.Replace("_H.", "_V."), 3, false);
                            strPosterPath = strPosterPath1;
                            string strFileName = Path.GetFileName(strPosterPath);
                            strPosterPath = "http://127.0.0.1:8887/" + strPosterPath.Replace(HttpContext.Current.Session["currentDisk"].ToString() + "/", "").Replace("\\", "/").Replace(strFileName, Uri.EscapeDataString(strFileName)).Replace("//", "/");
                            strPosterPath = strPosterPath.Replace("_V.", "_"+ strViewMode + ".").Replace("_H.", "_"+ strViewMode + ".").Replace(" ", "%20");
                        }
                        else
                        {
                            strPosterPath = File.Exists(outputPath) ? "/Images/System/poster_H.jpg_small.jpg" : SecondaryPage.ResizeImage("/Images/System/poster_" + strViewMode + ".jpg", outputPath, 3, true);
                            string strPosterPath2 = File.Exists(outputPath.Replace("_H.", "_V.")) ? "/Images/System/poster_V.jpg_small.jpg" : SecondaryPage.ResizeImage("/Images/System/poster_V.jpg", outputPath.Replace("_H.", "_V."), 3, true);
                        }
                    }
                    //Look for logos - icons
                    if (Directory.Exists(HttpContext.Current.Session["currentDisk"].ToString() + "/" + strPageName + "/" + charInitialChar + "/" + tblFiltered.Rows[i][1].ToString() + "/Gallery/Logos"))
                    {
                        string[] files = Directory.GetFiles(HttpContext.Current.Session["currentDisk"].ToString() + "/" + strPageName + "/" + charInitialChar + "/" + tblFiltered.Rows[i][1].ToString() + "/Gallery/Logos");
                        files = files.Where(val => val.Contains(".png")).ToArray();
                        Array.Sort(files);
                        foreach (string file in files)
                        {
                            string strCurrentFileName = Path.GetFileName(file);
                            if (strCurrentFileName.Contains("[") && strCurrentFileName.Contains("]"))
                            {
                                int pFrom = strCurrentFileName.IndexOf("[") + "[".Length;
                                int pTo = strCurrentFileName.LastIndexOf("]");

                                string strBracketContent = strCurrentFileName.Substring(pFrom, pTo - pFrom);

                                string[] strRenderPeriod = strBracketContent.Split(';');
                                foreach (var period in strRenderPeriod)
                                {
                                    int intYearIni = Convert.ToInt32(period.Substring(0, 4));
                                    int intYearEnd = !period.Contains("Current") ? Convert.ToInt32(period.Substring(5)) : Convert.ToInt32(DateTime.Now.Year);

                                    if (strCurrentFileName.Contains("Logo") && (intPhotoYear >= intYearIni && intPhotoYear <= intYearEnd) && strLogoPath == "")
                                    {
                                        strLogoPath = "http://127.0.0.1:8887/" + strPageName + "/" + charInitialChar + "/" + tblFiltered.Rows[i][1].ToString() + "/Gallery/Logos/" + Path.GetFileName(file);
                                        strLogoPath = strLogoPath.Replace(" ", "%20");
                                    }

                                    if (strCurrentFileName.Contains("Icon") && (intPhotoYear >= intYearIni && intPhotoYear <= intYearEnd) && strIconPath == "")
                                    {
                                        strIconPath = "http://127.0.0.1:8887/" + strPageName + "/" + charInitialChar + "/" + tblFiltered.Rows[i][1].ToString() + "/Gallery/Logos/" + Path.GetFileName(file);
                                        strIconPath = strIconPath.Replace(" ", "%20");
                                    }
                                }
                            }
                        }
                    }

                    //If icon is found
                    if (strIconPath != "")
                    {
                        strTitleTag = "";
                        strLogoTag = "<span id = 'LogoSpan" + i + "' class = 'logo_span logo_span_" + strViewMode + " divContentSpan' data-name='" + tblFiltered.Rows[i][1].ToString().Replace("█", "&#39;").Replace(" ⁄ ", "/") + "'><img id = 'itemLogo" + i + "' class='logo_item_" + strViewMode + "'  src='" + strIconPath + "'></img></span>";
                        strIconTag = "<span id = 'iconSpan" + i + "' class = 'icon_span icon_span_" + strViewMode + " divContentSpan' data-name='" + tblFiltered.Rows[i][1].ToString().Replace("█", "&#39;").Replace(" ⁄ ", "/") + "'><img id = 'itemIcon" + i + "' class='icon_item_" + strViewMode + "'  src='" + strLogoPath + "'></img></span>";


                    }
                    else if (strLogoPath != "")
                    {
                        strTitleTag = "";
                        if (strViewMode == "V")
                        {
                            strIconTag = "<span id = 'LogoSpan" + i + "' class = 'logo_span logo_span_" + strViewMode + " divContentSpan' data-name='" + tblFiltered.Rows[i][1].ToString().Replace("█", "&#39;").Replace(" ⁄ ", "/") + "'><img id = 'itemLogo" + i + "' class='logo_item_" + strViewMode + "' style='margin-top: 105%;' src='" + strLogoPath + "'></img></span>";
                            strLogoTag = "";
                        }
                        else
                        {
                            strLogoTag = "<span id = 'LogoSpan" + i + "' class = 'logo_span logo_span_" + strViewMode + " divContentSpan' data-name='" + tblFiltered.Rows[i][1].ToString().Replace("█", "&#39;").Replace(" ⁄ ", "/") + "'><img id = 'itemLogo" + i + "' class='logo_item_" + strViewMode + "' src='/Images/System/none.png'></img></span>";
                            strIconTag = "<span id = 'LogoSpan" + i + "' class = 'icon_span icon_span_" + strViewMode + " divContentSpan' data-name='" + tblFiltered.Rows[i][1].ToString().Replace("█", "&#39;").Replace(" ⁄ ", "/") + "'><img id = 'itemLogo" + i + "' class='logo_item_" + strViewMode + "' src='" + strLogoPath + "'></img></span>"; ;
                        }
                        strTitleTag = "";
                    }

                    else
                    {
                        strTitleTag = "<span id = 'LogoSpan" + i + "' class = 'item_span item_span_" + strViewMode + " divContentSpan' data-name='" + tblFiltered.Rows[i][1].ToString().Replace("█", "&#39;").Replace(" ⁄ ", "/") + "'>" + tblFiltered.Rows[i][1].ToString().Replace("█", "&#39;").Replace(" ⁄ ", "/") + "</span>";
                        strLogoTag = "";
                        strIconTag = "";
                    }

                    switch (strPageName)
                    {
                        case "Music":
                            if (strTable.Contains("OtherProjects"))
                            {
                                string strPartMembers = dicArtistPart != null ? " (" + dicArtistPart[tblFiltered.Rows[i][0].ToString()].Replace("█", "&#39;") + ")" : "";
                                strContent += "<div data-artistname='" + tblFiltered.Rows[i][1] + "' class=' " + strTable + " " + strAdditionalClass + " itemBoxRelated item_container item_container_" + strViewMode + "' style='margin-bottom:-6px' data-id='" + tblFiltered.Rows[i][0] + " 'data-code='" + tblFiltered.Rows[i][2].ToString() + "' data-name='" + tblFiltered.Rows[i][1].ToString().Replace("█", "&#39;").Replace(" ⁄ ", "/") + "'>" +
                                    "<div id= 'itemDiv" + i + "' class= 'button_item_" + strViewMode + " divContentItem" + i + "' data-id='" + tblFiltered.Rows[i][0] + "' data-name='" + tblFiltered.Rows[i][1] + "' data-code='" + tblFiltered.Rows[i][2] + "'" +
                                    "title='" + tblFiltered.Rows[i][1].ToString().Replace("█", "&#39;").Replace(" ⁄ ", "/") + strPartMembers + "' style='background-image:url(" + strPosterPath + "); background-size:cover; background-position:center top'>" + strLogoTag + strIconTag + strTitleTag +
                                    "</div></div>[#SEPARATOR]";
                            }

                            else
                            {
                                //If artist is unregistered (based on artist type)
                                if (tblFiltered.Columns.Count > 10 && tblFiltered.Rows[i][11].ToString() == "")
                                {
                                    switch (strTable)
                                    {
                                        case "bands":
                                            HttpContext.Current.Session["curPageFilter"] = "artist";
                                            HttpContext.Current.Session["curPageTable"] = "bands";
                                            break;
                                        default:
                                            break;
                                    }

                                    strContent += "<div class='itemBox item_container_unreg item_container_" + strViewMode + "' style='margin-bottom:-6px'  data-id='" + tblFiltered.Rows[i][0] + " 'data-code='" + tblFiltered.Rows[i][2].ToString() + "' data-name='" + tblFiltered.Rows[i][1].ToString() + "'>" +
                                    "<div id= 'itemDiv" + i + "' class= 'item_button_unreg button_item_" + strViewMode + " divContentItem" + i + "' data-id='" + tblFiltered.Rows[i][0] + "' data-name='" + tblFiltered.Rows[i][1] + "' data-code='" + tblFiltered.Rows[i][2] + "'" +
                                    "title='" + tblFiltered.Rows[i][1].ToString().Replace("█", "&#39;").Replace(" ⁄ ", "/") + "' style='background-image:url(" + strPosterPath + "); background-size:cover; background-position:center top'>" + strLogoTag + strIconTag + strTitleTag +
                                    "</div></div>";
                                }
                                else if (tblFiltered.Columns.Count > 10 && tblFiltered.Rows[i][11].ToString() != "")
                                {
                                    strContent += "<div class='itemBox item_container item_container_" + strViewMode + "' style='margin-bottom:-6px' data-id='" + tblFiltered.Rows[i][0] + " 'data-code='" + tblFiltered.Rows[i][2].ToString() + "' data-name='" + tblFiltered.Rows[i][1].ToString() + "'>" +
                                    "<div id= 'itemDiv" + i + "' class= 'button_item_" + strViewMode + " divContentItem" + i + "' data-id='" + tblFiltered.Rows[i][0] + "' data-name='" + tblFiltered.Rows[i][1] + "' data-code='" + tblFiltered.Rows[i][2] + "'" +
                                    "title='" + tblFiltered.Rows[i][1].ToString().Replace("█", "&#39;").Replace(" ⁄ ", "/") + "' style='background-image:url(" + strPosterPath + "); background-size:cover; background-position:center top'>" + strLogoTag + strIconTag + strTitleTag +
                                    "</div></div>";
                                }
                                else
                                {
                                    //Playlists
                                    string strPosterBackground = "";
                                    if (strPosterPath == "")
                                    {
                                        strPosterPath = "/Images/Playlists/" + tblFiltered.Rows[i][1].ToString() + ".jpg";
                                    }
                                    strContent += "<div class='itemBox item_container_playlist item_container_" + strViewMode + "' style='margin-bottom:-6px'  data-id='" + tblFiltered.Rows[i][0] + " 'data-code='" + tblFiltered.Rows[i][2].ToString() + "' data-name='" + tblFiltered.Rows[i][1].ToString() + "'>" +
                                    "<div id= 'itemDiv" + i + "' class= 'item_button_playlist button_item_" + strViewMode + " divContentItem" + i + "' data-id='" + tblFiltered.Rows[i][0] + "' data-name='" + tblFiltered.Rows[i][1] + "' data-code='" + tblFiltered.Rows[i][2] + "'" +
                                    "title='" + tblFiltered.Rows[i][1].ToString().Replace("█", "&#39;").Replace(" ⁄ ", "/") + "' style='background-image:url(" + "\"" +strPosterPath +"\"" + "); background-size:cover; background-position:center top'>" + strLogoTag + strIconTag + strTitleTag +
                                    "</div></div>";

                                }
                            }

                            break;
                        default:
                            strContent += "";
                            break;
                    }
                }
            }
            
            if (strTable.Contains("OtherProjects") && strNotFound != "")
            {
                string[] strNotFoundArr = strNotFound.Split(';');
                for (int i = 0; i < strNotFoundArr.Length; i++)
                {
                    string strNotFoundName = strNotFoundArr[i].Replace("_not_found", "");

                    string strURL = "https://en.wikipedia.org/wiki/" + strNotFoundName;

                    try
                    {
                        HttpWebRequest request = WebRequest.Create(strURL) as HttpWebRequest;
                        request.Method = "HEAD";
                        HttpWebResponse response = request.GetResponse() as HttpWebResponse;
                        response.Close();
                    }
                    catch
                    {
                        strURL = "https://www.google.com/search?q=" + strNotFoundName.Replace(" ", "+");
                    }


                    string strTitleTag = "<span id = 'LogoSpan" + i + "' class = 'item_span item_span_" + strViewMode + " divContentSpan' data-name='" + strNotFoundName.Replace("█", "&#39;").Replace(" ⁄ ", "/") + "'>" + strNotFoundName.Replace("█", "&#39;").Replace(" ⁄ ", "/") + "</span>";

                    strContent += "<div data-artistname='" + strNotFoundName + "' class=' " + strTable + " " + "ItemNotFound" + " itemBoxRelated item_container item_container_" + strViewMode + "' style='margin-bottom:-6px' data-id='ItemNotFound' data-code='ItemNotFound' data-name='" + strNotFoundName.Replace("█", "&#39;").Replace(" ⁄ ", "/") + "'>" +
                        "<div id= 'itemDiv" + i + "' class= 'button_item_" + strViewMode + " divContentItem" + i + "' data-id='ItemNotFound' data-name='" + strNotFoundName + "' data-code='ItemNotFound'" +
                        "title='" + strNotFoundName + "' style='background-image:url(/Images/System/poster_" + strViewMode + ".jpg); background-size:cover; background-position:center top'>" + strTitleTag +
                        "</div><a href='" + strURL + "' id='aNotFoundLink" + i + "' class='aNotFound' target='_blank' style='display:none'></a></div>[#SEPARATOR]";
                }
                
            }

            return strContent;
        }

        private static List<SearchResult> GoogleFetchImages(DataTable dtGoogleAuth, string strSearchTerm)
        {
            var request = WebRequest.Create(dtGoogleAuth.Rows[0][4].ToString().Replace("[YOUR_SEARCH_TERM]", strSearchTerm));
            HttpWebResponse response = (HttpWebResponse)request.GetResponse();
            Stream dataStream = response.GetResponseStream();
            StreamReader reader = new StreamReader(dataStream);
            string responseString = reader.ReadToEnd();
            dynamic jsonData = JsonConvert.DeserializeObject(responseString);
            List<SearchResult> results = new List<SearchResult>();

            foreach (var item in jsonData.items)
            {
                results.Add(new SearchResult
                {
                    Title = item.title,
                    Link = item.link,
                    Snippet = item.snippet,
                });
            }

            return results;
        }

        /// <summary>
        /// Sync folders to show on grid
        /// </summary>
        /// <param name="strTable"></param>
        public static void SyncFolders(string strTable = "")
        {
            DataTable dtTMDbAuth = ExtServices.GetRecordByValue("apiauth", "apiName", "TMDb");
            string strTMDBKey = dtTMDbAuth?.Rows[0][2].ToString();
            string rootPath = Path.Combine(@"C:\Users\Surface Pro 6\Downloads\MediaBinger\", HttpContext.Current.Session["curPageName"].ToString());
            string[] strArtistNames = strTable == "artists" ? HttpContext.Current.Session["fullArtistList"] as string[] : strTable == "series" ? HttpContext.Current.Session["fullSeriesList"] as string[] : strTable == "movies" ? HttpContext.Current.Session["fullMovieList"] as string[] : strTable == "books" ? HttpContext.Current.Session["fullBookList"] as string[] : strTable == "games" ? HttpContext.Current.Session["fullGamesList"] as string[] : HttpContext.Current.Session["fullArtistList"] as string[];
            if (strArtistNames == null || strArtistNames.Length <= 0)
            {
                DataTable dtData = strTable != "" ? ExtServices.GetContentByTableName(strTable) : new DataTable();
                string strFieldName = strTable == "artists" ? "bndName" : strTable == "series" ? "serName" : strTable == "movies" ? "movName" : strTable == "books" ? "booName" : strTable == "games" ? "gamName" : "bndName";
                if (dtData != null)
                {
                    string[] array = dtData.AsEnumerable().Select(row => row.Field<string>(strFieldName)).ToArray();
                    Array.Sort(array);
                    switch (strTable)
                    {
                        case "artists":
                        case "bands":
                            HttpContext.Current.Session["fullArtistList"] = array;
                            HttpContext.Current.Session["fullArtistTable"] = dtData;
                            break;
                        case "movies":
                            HttpContext.Current.Session["fullMovieList"] = array;
                            HttpContext.Current.Session["fullMovieTable"] = dtData;
                            break;
                        case "series":
                            HttpContext.Current.Session["fullSeriesList"] = array;
                            HttpContext.Current.Session["fullSeriesTable"] = dtData;
                            break;
                        case "books":
                            HttpContext.Current.Session["fullBookList"] = array;
                            HttpContext.Current.Session["fullBookTable"] = dtData;
                            break;
                        case "games":
                            HttpContext.Current.Session["fullGameList"] = array;
                            HttpContext.Current.Session["fullGameTable"] = dtData;
                            break;
                        default:
                            break;
                    }
                    
                    strArtistNames = array;
                }
            }

            if (strArtistNames == null)
            {
                strArtistNames = new string[] { "" };
            }

            string[] strDirectories = Directory.GetDirectories(rootPath, "*", SearchOption.AllDirectories).Where(dir => dir.Count(c => c == Path.DirectorySeparatorChar) == rootPath.Count(c => c == Path.DirectorySeparatorChar) + 2).Where(dir => !strArtistNames.Contains(new DirectoryInfo(dir).Name.Replace(',', '■').Replace('\'', '█'))).ToArray();
            Array.Sort(strDirectories);
            if (strDirectories != null && strDirectories.Length > 0)
            {
                MusicBrainzClient client = new MusicBrainzClient();
                
                DataTable dtColumns = strTable != "" ? ExtServices.GetTableColumns(strTable) : new DataTable();
                foreach (string dir in strDirectories)
                {
                    //Register Series adding name and code
                    if (strTable == "series")
                    {
                        //Look for subseries
                        string[] strSubseries = Directory.GetDirectories(dir, "*", SearchOption.AllDirectories).Where(subdir => subdir.Count(c => c == Path.DirectorySeparatorChar) == rootPath.Count(c => c == Path.DirectorySeparatorChar) + 2).Where(subdir => !strArtistNames.Contains(new DirectoryInfo(dir).Name.Replace(',', '■').Replace('\'', '█'))).ToArray();
                        Array.Sort(strSubseries);
                        string directorySearchPattern = @"\bGallery\b";
                        bool hasExactGallery = strSubseries.Any(path => Regex.IsMatch(path, directorySearchPattern));

                        if (hasExactGallery)
                        {
                            //No subseries
                            string strColName = dtColumns.Rows[1][0].ToString();
                            string strColName2 = dtColumns.Rows.Count > 9 ? dtColumns.Rows[9][0].ToString() : "";
                            DirectoryInfo dir_info = new DirectoryInfo(dir);
                            string strFolderName = dir_info.Name.Replace(',', '■').Replace('\'', '█');
                            Task<SearchTv> taskResult = Task.Run(() => GetSeriesData(strFolderName, strTMDBKey));
                            taskResult.Wait();

                            if (strTable != "" && taskResult != null)
                            {
                                int foundId = taskResult.Id;
                                string officialName = taskResult.Result.Name;
                                string firstAirDate = taskResult.Result.FirstAirDate?.ToString("yyyy");
                                // Now you have the ID (33446)
                                // You can use foundId to do a deeper fetch or just store it
                                //lblResult.Text = $"Found: {officialName} ({firstAirDate}) - ID: {foundId}";

                                List<string> lstCols = new List<string>();
                                lstCols.Add(strColName);
                                lstCols.Add(strColName2);
                                List<string> lstVals = new List<string>();
                                lstVals.Add(strFolderName);
                                lstVals.Add(taskResult.Id.ToString());
                                ExtServices.InsertByTableName(strTable, lstCols, lstVals);

                                DataTable dtData = strTable != "" ? ExtServices.GetContentByTableName(strTable) : new DataTable();
                                string[] array = dtData.AsEnumerable().Select(row => row.Field<string>("bndName")).ToArray();
                                Array.Sort(array);
                                HttpContext.Current.Session["fullArtistList"] = array;
                                strArtistNames = array;
                            }

                        }
                        else
                        {
                            //Has subseries
                            foreach (string subseries in strSubseries)
                            {

                            }
                        }
                    }
                    else
                    {
                        //Register Bands adding name and code
                        //Write code from MusicBrainz
                        string strColName = dtColumns.Rows[1][0].ToString();
                        string strColName2 = dtColumns.Rows.Count > 2 ? dtColumns.Rows[2][0].ToString() : "";
                        DirectoryInfo dir_info = new DirectoryInfo(dir);
                        string strFolderName = dir_info.Name.Replace(',', '■').Replace('\'', '█');
                        Task<string> taskId = Task.Run(() => GetItemId(client, strFolderName));
                        taskId.Wait();

                        if (strTable != "" && taskId.Result != "")
                        {
                            List<string> lstCols = new List<string>();
                            lstCols.Add(strColName);
                            lstCols.Add(strColName2);
                            List<string> lstVals = new List<string>();
                            lstVals.Add(strFolderName);
                            lstVals.Add(taskId.Result);
                            ExtServices.InsertByTableName(strTable, lstCols, lstVals);

                            DataTable dtData = strTable != "" ? ExtServices.GetContentByTableName(strTable) : new DataTable();
                            string[] array = dtData.AsEnumerable().Select(row => row.Field<string>("bndName")).ToArray();
                            Array.Sort(array);
                            HttpContext.Current.Session["fullArtistList"] = array;
                            strArtistNames = array;
                        }
                    }
                    
                }
            }
        }

        public static string GetArtistNews(NewsApiClient client, string strName)
        {
            string strContent = "";
            var articlesResponse = client.GetEverything(new EverythingRequest
            {
                Q = strName + " music",
                SortBy = SortBys.Popularity,
                Language = Languages.EN,
                From = new DateTime(2023, 3, 21),
                Page = 1,
                PageSize = 1
            });

            if (articlesResponse.Status == Statuses.Ok)
            {
                // total results found
                Console.WriteLine(articlesResponse.TotalResults);

                // here's the first 20
                foreach (var article in articlesResponse.Articles)
                {
                    // title
                    Console.WriteLine(article.Title);
                    // author
                    Console.WriteLine(article.Author);
                    // description
                    Console.WriteLine(article.Description);
                    // url
                    Console.WriteLine(article.Url);
                    // image
                    Console.WriteLine(article.UrlToImage);
                    // published at
                    Console.WriteLine(article.PublishedAt);
                }
            }

            return strContent;
        }

        public void LoadSite(string strValue)
        {
            //menContainer.InnerHtml = "<span>" + strValue + "</span>";
        }

        [System.Web.Services.WebMethod]
        public static string SetSessionVariables(string strSession1 = "", string strSession2 = "", string strSession3 = "", string strSession4 = "")
        {
            string strCurrentMediaType = "";
            if (strSession1 == "SetlistPlaylist")
            {
                HttpContext.Current.Session["curSelectedYear"] = strSession2;
                return "";
            }
            HttpContext.Current.Session["curIsSingleBox"] = HttpContext.Current.Session["curIsSingleBox"] == null ? "" : HttpContext.Current.Session["curIsSingleBox"];
            if (HttpContext.Current.Session["mediaType"] != null)
            {
                strCurrentMediaType = HttpContext.Current.Session["mediaType"].ToString();
            }
            
            HttpContext.Current.Session["curModifiedOrigin"] = "";
            if (strSession2 != "userplaylist")
            {
                HttpContext.Current.Session["systemPlaylist"] = "false";
            }
            
            HttpContext.Current.Session["mediaType"] = "release";
            string strURL = "";
            switch (HttpContext.Current.Session["curPageName"].ToString())
            {
                case "Music":

                    if (strSession1 != "" && strSession2.Contains("Return") && strSession1 != HttpContext.Current.Session["curArtistName"].ToString())
                    {
                        //Get data for new artist and update session variables
                        DataTable dtArtist = ExtServices.GetRecordByValue("bands", "bndName", strSession1, "");
                        if (dtArtist != null && dtArtist.Rows.Count > 0)
                        {
                            HttpContext.Current.Session["curArtistName"] = dtArtist.Rows[0][1].ToString();
                            char charInitialChar = HttpContext.Current.Session["curArtistName"].ToString().ToUpper()[0];
                            HttpContext.Current.Session["curArtistInitial"] = Char.IsDigit(charInitialChar) ? '#' : Char.IsSymbol(charInitialChar) ? '' : charInitialChar;
                            HttpContext.Current.Session["curArtistCode"] = dtArtist.Rows[0][2].ToString();
                            HttpContext.Current.Session["curArtistID"] = dtArtist.Rows[0][0].ToString();
                        }
                        else
                        {
                            //Look for artist online
                            strURL = "https://en.wikipedia.org/wiki/" + strSession1;

                            try
                            {
                                HttpWebRequest request = WebRequest.Create(strURL) as HttpWebRequest;
                                request.Method = "HEAD";
                                HttpWebResponse response = request.GetResponse() as HttpWebResponse;
                                response.Close();
                            }
                            catch
                            {
                                strURL = "https://www.google.com/search?q=" + strSession1.Replace(" ", "+") ;
                            }
                        }
                    }

                    if (strSession2 == "bands")
                    {
                        HttpContext.Current.Session["curArtistName"] = strSession1;
                        char charInitialChar = strSession1.ToString().ToUpper()[0];
                        HttpContext.Current.Session["curArtistInitial"] = Char.IsDigit(charInitialChar) ? '#' : Char.IsSymbol(charInitialChar) ? '' : charInitialChar;

                        DataTable dtArtist = ExtServices.GetRecordByValue(strSession2, "bndName", strSession1, "");
                        if (dtArtist != null && dtArtist.Rows.Count > 0)
                        {
                            HttpContext.Current.Session["curArtistCode"] = dtArtist.Rows[0][2].ToString();
                            HttpContext.Current.Session["curArtistID"] = dtArtist.Rows[0][0].ToString();
                        }

                        //If DT empty means to get by Alias
                        else
                        {
                            dtArtist = ExtServices.GetRecordLikeValue(strSession2, "bndOtherNames", strSession1);
                            if (dtArtist != null && dtArtist.Rows.Count > 0)
                            {
                                HttpContext.Current.Session["curArtistName"] = dtArtist.Rows[0][1].ToString();
                                charInitialChar = HttpContext.Current.Session["curArtistName"].ToString().ToUpper()[0];
                                HttpContext.Current.Session["curArtistInitial"] = Char.IsDigit(charInitialChar) ? '#' : Char.IsSymbol(charInitialChar) ? '' : charInitialChar;
                                HttpContext.Current.Session["curArtistCode"] = dtArtist.Rows[0][2].ToString();
                                HttpContext.Current.Session["curArtistID"] = dtArtist.Rows[0][0].ToString();
                            }
                        }
                    }

                    else if (strSession2 == "ItemPath")
                    {
                        HttpContext.Current.Session["curItemPath"] = strSession1;
                    }

                    else if (strSession2 == "ImagePath")
                    {
                        HttpContext.Current.Session["curImagePath"] = strSession1;
                        HttpContext.Current.Session["allImagePaths"] = strSession3;
                    }

                    else if (strSession2 == "curPersonID")
                    {
                        HttpContext.Current.Session[strSession2] = strSession1;
                        HttpContext.Current.Session["curColor"] = strSession3;
                    }
                    else if (strSession2 == "curReleaseName")
                    {
                        if (strSession3 == "")
                        {
                            string strRoot = HttpContext.Current.Session["currentDisk"].ToString() + "/Music/" + HttpContext.Current.Session["curArtistName"].ToString().Substring(0, 1) + "/" + HttpContext.Current.Session["curArtistName"].ToString() + "/";
                            var foldersFound = Directory.GetDirectories(strRoot, strSession1, SearchOption.AllDirectories);
                            Array.Sort(foldersFound);
                            foreach (string strPath in foldersFound)
                            {
                                strSession3 = strPath.Replace(strRoot, "").Replace("\\", "/").Split('/')[0].ToString();
                                break;
                            }
                        }

                        HttpContext.Current.Session[strSession2] = strSession1;
                        HttpContext.Current.Session["curPath"] = strSession3;
                        HttpContext.Current.Session["curRelSource"] = "/" + strSession3?.Replace("\\","/").Split('/').LastOrDefault();
                        HttpContext.Current.Session["mediaType"] = strSession1.Contains("01.01.1000. ") ? "playlist" : "release";
                    }

                    else if (strSession2 == "curReleaseName2")
                    {
                        string strSection = strSession3.Split(';')[0];
                        string strArtist = strSession3.Split(';')[1].Substring(1);

                        HttpContext.Current.Session["curArtistName"] = strArtist;
                        char charInitialChar = strArtist.ToString().ToUpper()[0];
                        HttpContext.Current.Session["curArtistInitial"] = Char.IsDigit(charInitialChar) ? '#' : Char.IsSymbol(charInitialChar) ? '' : charInitialChar;
                        DataTable dtArtist = ExtServices.GetRecordByValue("bands", "bndName", strArtist, "");
                        if (dtArtist != null && dtArtist.Rows.Count > 0)
                        {
                            HttpContext.Current.Session["curArtistCode"] = dtArtist.Rows[0][2].ToString();
                            HttpContext.Current.Session["curArtistID"] = dtArtist.Rows[0][0].ToString();
                        }

                        //If DT empty means to get by Alias
                        else
                        {
                            dtArtist = ExtServices.GetRecordLikeValue("bands", "bndOtherNames", strArtist);
                            if (dtArtist != null && dtArtist.Rows.Count > 0)
                            {
                                HttpContext.Current.Session["curArtistName"] = dtArtist.Rows[0][1].ToString();
                                charInitialChar = HttpContext.Current.Session["curArtistName"].ToString().ToUpper()[0];
                                HttpContext.Current.Session["curArtistInitial"] = Char.IsDigit(charInitialChar) ? '#' : Char.IsSymbol(charInitialChar) ? '' : charInitialChar;
                                HttpContext.Current.Session["curArtistCode"] = dtArtist.Rows[0][2].ToString();
                                HttpContext.Current.Session["curArtistID"] = dtArtist.Rows[0][0].ToString();
                            }
                        }

                        strSession1 = strSession1.Contains(" [By") ? strSession1.Split('[')[0].Remove(strSession1.Split('[')[0].Length - 1, 1) : strSession1;

                        HttpContext.Current.Session["curReleaseName"] = strSession1;
                        HttpContext.Current.Session["curPath"] = strSection;
                    }

                    else if (strSession3.Contains("_Link_Click"))
                    {
                        HttpContext.Current.Session["curArtistName"] = strSession1;
                        char charInitialChar = strSession1.ToString().ToUpper()[0];
                        HttpContext.Current.Session["curArtistInitial"] = Char.IsDigit(charInitialChar) ? '#' : Char.IsSymbol(charInitialChar) ? '' : charInitialChar;
                        HttpContext.Current.Session["curArtistCode"] = strSession2;
                        HttpContext.Current.Session["curArtistID"] = strSession3.Replace("_Link_Click","");
                        HttpContext.Current.Session["curModifiedOrigin"] = "_Link_Click";
                    }

                    else if ((strSession2.Contains("Return") && strCurrentMediaType != "playlist") || (strSession2.Contains("Return") && strCurrentMediaType == "playlist" && strSession4 == "1"))
                    {
                        //Update session variables for external artist
                        strURL = "";
                        if (strSession1 != "")
                        {
                            DataTable dtArtist = ExtServices.GetRecordByValue("bands", "bndID", strSession1.Replace(" ",""), "");
                            dtArtist = dtArtist == null ? ExtServices.GetRecordByValue("bands", "bndName", strSession1.Replace(" ", ""), ""): dtArtist;
                            HttpContext.Current.Session["curArtistName"] = dtArtist.Rows[0][1].ToString();
                            char charInitialChar = HttpContext.Current.Session["curArtistName"].ToString().ToUpper()[0];
                            HttpContext.Current.Session["curArtistInitial"] = Char.IsDigit(charInitialChar) ? '#' : Char.IsSymbol(charInitialChar) ? '' : charInitialChar;
                            HttpContext.Current.Session["curArtistCode"] = dtArtist.Rows[0][2].ToString();
                            HttpContext.Current.Session["curArtistID"] = dtArtist.Rows[0][0].ToString();
                        }
                        else
                        {
                            //Used to redirect to another page
                            if (strSession4 != "")
                            {
                                HttpContext.Current.Session["curIsSingleBox"] = strSession4;
                            }
                        }
                    }
                    else if (strSession2.Contains("Return") && strCurrentMediaType == "playlist")
                    {
                        strURL = "";
                        HttpContext.Current.Session["mediaType"] = "playlist";
                    }
                    else if (strSession2 == "userplaylist")
                    {
                        HttpContext.Current.Session["curReleaseName"] = strSession3;
                        HttpContext.Current.Session["curPath"] = strSession1;
                        HttpContext.Current.Session["mediaType"] = "playlist";
                        HttpContext.Current.Session["curArtistName"] = HttpContext.Current.Session["usrName"] != null ? HttpContext.Current.Session["usrName"].ToString() : "User";
                        char charInitialChar = HttpContext.Current.Session["curArtistName"].ToString().ToUpper()[0];
                        HttpContext.Current.Session["curArtistInitial"] = Char.IsDigit(charInitialChar) ? '#' : Char.IsSymbol(charInitialChar) ? '' : charInitialChar;
                        HttpContext.Current.Session["curArtistCode"] = "0";
                    }

                    else
                    {
                        HttpContext.Current.Session["curArtistName"] = strSession1;
                        char charInitialChar = strSession1.ToString().ToUpper()[0];
                        HttpContext.Current.Session["curArtistInitial"] = Char.IsDigit(charInitialChar) ? '#' : Char.IsSymbol(charInitialChar) ? '' : charInitialChar;
                        HttpContext.Current.Session["curArtistCode"] = strSession2;
                        HttpContext.Current.Session["curArtistID"] = strSession3;
                    }

                    HttpContext.Current.Session["curSubPageCode"] = 201;
                    break;
                default:
                    break;
            }

            return strURL == "" ? HttpContext.Current.Session["curArtistName"] + ";" + HttpContext.Current.Session["curArtistCode"] + ";" + HttpContext.Current.Session["curPageName"].ToString() : strURL;
        }

        private static readonly HttpClient httpClient = new HttpClient();
        [System.Web.Services.WebMethod]
        public static string GetDashboardHtmlAsync()
        {
            //Get Directories of existing artists
            //string rootPath = HttpContext.Current.Session["currentDisk"].ToString() + "/" + HttpContext.Current.Session["curPageName"];
            //string[] dirArtists = Directory.GetDirectories(rootPath, "*", SearchOption.AllDirectories)
            //    .Where(dir => Path.GetFileName(dir).Equals("Audio", StringComparison.OrdinalIgnoreCase))
            //    .Select(dir => Directory.GetParent(dir)?.Name) // ← Get parent of "Audio", which is the band folder
            //    .Where(band => !string.IsNullOrWhiteSpace(band) &&
            //                   !band.Equals("Various Artists", StringComparison.OrdinalIgnoreCase))
            //    .Distinct()
            //    .ToArray();

            //string strBandNames = string.Join(",", dirArtists);

            //DataTable dtBands = ExtServices.GetRecordByValueList("bands", "bndName", strBandNames);
            //if (dtBands != null && dtBands.Rows.Count > 0)
            //{
            //    var sb = new StringBuilder();
            //    sb.Append("<div class='containerDiv'>");

            //    sb.Append("<div class='panelDiv'><h3>LATEST RELEASES</h3>");

            //    MusicBrainzClient client = new MusicBrainzClient();

            //    for (int i = 0; i < dtBands.Rows.Count; i++)
            //    {
            //        if (dtBands.Rows[i][2]?.ToString() != "")
            //        {
            //            string strFieldValue = dtBands.Rows[i][2].ToString();
            //            Task<string> taskId = Task.Run(() => GetLatestReleasesHtmlAsync(client, strFieldValue));
            //            taskId.Wait();
            //            string strRelData = taskId.Result;
            //        }
            //    }
            //}

            //return "";
            if (HttpContext.Current.Session["currentDashboard"] != null && HttpContext.Current.Session["currentDashboard"].ToString() != "")
            {
                return HttpContext.Current.Session["currentDashboard"].ToString();
            }

            var sb = new StringBuilder();
            sb.Append("<div class='sectionRow'>");

            sb.Append("<div id='topTrackCont0' class='sectionColumn columnTitle' data-value='' style='display: flex; flex-direction: column; align-items: center;'>"
                                + "<img runat='server' id='coverTopTrack0' class='coverTopTrack' src='/Images/Logos/On%20Repeat.png' data-value='' style='margin-top:20px; height: 60px; max-width:100%;'/>"
                                + "<span id = 'SingleSpanArt0' class = 'divSubContentSpan' data-name='' style='text-align: center;font-size:10px;'>"
                                + "<p class='aTopTrack' data-value='' data-path='' style='text-decoration: none; font-weight:bold;cursor:pointer;margin-top:5px'>Most Played Tracks</p></span>"
                                + "</div>");
            DataTable dtPlaylistUserRow = ExtServices.GetRecordByValue("reproductions", " repMediaType", "200", "repReproductions", "DESC", "30");
            if (dtPlaylistUserRow.Rows.Count > 0)
            {
                int intCountTracks = dtPlaylistUserRow.Rows.Count > 5 ? 5 : dtPlaylistUserRow.Rows.Count;
                var regex = new Regex(@"\d{4}\.\d{2}\.\d{2}\..+?");
                string strReleasePath = "";
                for (int i = 0; i < intCountTracks; i++)
                {
                    string path = dtPlaylistUserRow.Rows[i][6].ToString();
                    string strPlays = dtPlaylistUserRow.Rows[i][5].ToString();
                    string strTrackTitle = Path.GetFileNameWithoutExtension(path).Substring(4);
                    strTrackTitle = strTrackTitle.Contains(" [") ? strTrackTitle.Replace(" [", "[").Split('[')[0] : strTrackTitle;
                    var segments = path.Split('/');
                    if (path.Contains("/Singles/") || (!path.Contains("/Singles/") && path.Contains(" Edition/")))
                    {
                        // Remove the filename only
                        strReleasePath = string.Join("/", segments.Take(segments.Length - 1));
                    }
                    else
                    {
                        // Find first folder starting with a date
                        int index = Array.FindIndex(segments, s => regex.IsMatch(s));
                        strReleasePath = index > 0 ? string.Join("/", segments.Take(index + 1)) : path;
                    }

                    string strArtistName = "";
                    int musicIndex = Array.IndexOf(segments, "Music");
                    int audioIndex = Array.IndexOf(segments, "Audio");

                    if (musicIndex >= 0 && audioIndex > musicIndex + 1)
                    {
                        strArtistName = segments[audioIndex - 1]; // Artist name is right before "Audio"
                    }

                    if (Directory.Exists(strReleasePath.Replace(HttpContext.Current.Session["currentServer"].ToString(), HttpContext.Current.Session["currentDisk"].ToString()) + "/[Artwork]"))
                    {
                        string strCoverPath = strReleasePath + "/[Artwork]/Cover - Front.jpg";
                        sb.Append("<div id='topTrackCont" + i + "' class='sectionColumn sectionTrackRow' data-value='" + path + "' style='display: flex; flex-direction: column; align-items: center;'>"
                            +"<img runat='server' id='coverTopTrack" + i + "' class='imgTopTrack coverTopTrack' src='" + strCoverPath + "' data-value='" + strReleasePath + "' style='margin-top:20px; height: 110px; max-width:100%; cursor:pointer' title='" + strPlays + " plays'/>"
                            + "<span id = 'SingleSpan" + i + "' class = 'divSubContentSpan' data-name='" + strTrackTitle.Replace(";", ",") + "' style='text-align: center;font-size:10px;'>"
                            + "<p class='aTopTrack' data-value='" + strTrackTitle.Replace("'", "%27") + "' data-path='" + path + "' style='text-decoration: none; font-weight:bold;cursor:pointer;margin-top:2px'>" + strTrackTitle + "</p><p style='margin-top:-20px'>"+ strArtistName + "<p></span>"
                            + "</div>");
                    }
                    else
                    {
                        //intCountTracks++;
                        continue;
                    }
                }
            }
            sb.Append("</div>");

            sb.Append("<div class='sectionRow'>");
            sb.Append("<div id='topArtCont0' class='sectionColumn columnTitle' data-value='' style='display: flex; flex-direction: column; align-items: center;'>"
                                + "<img runat='server' id='coverTopArt0' class='coverTopTrack' src='/Images/Logos/Icons.png' data-value='' style='margin-top:20px; height: 40px; max-width:100%;'/>"
                                + "<span id = 'SingleSpanArt0' class = 'divSubContentSpan' data-name='' style='text-align: center;font-size:10px;'>"
                                + "<p class='aTopTrack' data-value='' data-path='' style='text-decoration: none; font-weight:bold;cursor:pointer;margin-top:5px'>Your Top Artists</p></span>"
                                + "</div>");
            DataTable dtSubFilterData = new DataTable();
            dtPlaylistUserRow = ExtServices.GetValuesByGroupedColumn("reproductions", "repArtistID", "total", "repArtistID", "DESC");
            string strCountryIDs = "", strGenreIDs = "";
            if (dtPlaylistUserRow.Rows.Count > 0)
            {
                string strArtistIDsFull = "";
                for (int i = 0; i < dtPlaylistUserRow.Rows.Count; i++)
                {
                    strArtistIDsFull = strArtistIDsFull == "" ? dtPlaylistUserRow.Rows[i][0].ToString() : strArtistIDsFull + "," + dtPlaylistUserRow.Rows[i][0].ToString();
                }

                dtSubFilterData = ExtServices.GetRecordByValueList("bands", "bndID", strArtistIDsFull);
                if (dtSubFilterData.Rows.Count > 0)
                {
                    for (int i = 0; i < dtSubFilterData.Rows.Count; i++)
                    {
                        if (i < 5)
                        {
                            string strArtistName = dtSubFilterData.Rows[i][1].ToString();
                            string strArtistCode = dtSubFilterData.Rows[i][2].ToString();
                            string strArtistId = dtSubFilterData.Rows[i][0].ToString();
                            char charCurInitial = strArtistName.ToUpper()[0];
                            charCurInitial = Char.IsDigit(charCurInitial) ? '#' : Char.IsSymbol(charCurInitial) ? '' : charCurInitial;
                            string strCoverArtistPath = HttpContext.Current.Session["currentDisk"].ToString() + "/Music/" + charCurInitial + "/" + strArtistName + "/Gallery/Photos";
                            string latestArtistPhoto = Directory.GetFiles(strCoverArtistPath, "*_H.jpg")?.OrderByDescending(f => f)?.FirstOrDefault()?.ToString();
                            if (latestArtistPhoto != "")
                            {
                                latestArtistPhoto = latestArtistPhoto.Replace(HttpContext.Current.Session["currentDisk"].ToString(), HttpContext.Current.Session["currentServer"].ToString()).Replace("\\", "/");
                            }

                            sb.Append("<div id='topArtCont" + i + "' class='sectionColumn itemBox' data-value='" + latestArtistPhoto + "' data-name='" + strArtistName + "' data-code='" + strArtistCode + "' data-id='" + strArtistId + "' style='display: flex; flex-direction: column; align-items: center;'>"
                                + "<img runat='server' id='coverTopArt" + i + "' class='coverTopTrack itemBox' src='" + latestArtistPhoto + "' data-value='" + dtPlaylistUserRow.Rows[i][0].ToString() + "' data-name='" + strArtistName + "' data-code='" + strArtistCode + "' data-id='" + strArtistId + "' style='margin-top:20px; height: 110px; max-width:100%; cursor:pointer' title='" + strArtistName + "'/>"
                                + "<span id = 'SingleSpanArt" + i + "' class = 'divSubContentSpan' data-name='" + strArtistName + "' style='text-align: center;font-size:10px;'>"
                                + "<p class='aTopTrack' data-value='" + strArtistName + "' data-path='" + latestArtistPhoto + "' style='text-decoration: none; font-weight:bold;cursor:pointer;margin-top:2px'>" + strArtistName + "</p></span>"
                                + "</div>");
                        }

                        strGenreIDs = strGenreIDs == "" ? dtSubFilterData.Rows[i][10].ToString() : strGenreIDs + ";" + dtSubFilterData.Rows[i][10].ToString();
                        strCountryIDs = strCountryIDs == "" ? dtSubFilterData.Rows[i][5].ToString().Split('[')[0] : strCountryIDs + ";" + dtSubFilterData.Rows[i][5].ToString().Split('[')[0];
                    }
                }
            }
            sb.Append("</div>");
            List<string> lstGenres = strGenreIDs.Split(';').ToList();
            lstGenres = lstGenres.GroupBy(name => name).OrderByDescending(group => group.Count()).Take(5).Select(group => group.Key).ToList();
            if (lstGenres.Count > 0)
            {
                string strGenres = string.Join(",", lstGenres);
                sb.Append("<div class='sectionRow'>");
                sb.Append("<div id='topGenCont0' class='sectionColumn columnTitle' data-value='' style='display: flex; flex-direction: column; align-items: center;'>"
                                + "<img runat='server' id='coverTopGen0' class='coverTopTrack' src='/Images/Logos/Music%20Vibes.png' data-value='' style='margin-top:20px; height: 70px; max-width:100%;'/>"
                                + "<span id = 'SingleSpanArt0' class = 'divSubContentSpan' data-name='' style='text-align: center;font-size:10px;'>"
                                + "<p class='aTopTrack' data-value='' data-path='' style='text-decoration: none; font-weight:bold;cursor:pointer;margin-top:5px'>Genres on rotation</p></span>"
                                + "</div>");
                dtSubFilterData = ExtServices.GetRecordByValueList("subgenres", "sgnID", strGenres);
                if (dtSubFilterData.Rows.Count > 0)
                {
                    for (int i = 0; i < dtSubFilterData.Rows.Count; i++)
                    {
                        string strGenreName = dtSubFilterData.Rows[i][1].ToString();
                        string strSubgenreID = dtSubFilterData.Rows[i][0].ToString();
                        string strParentGenreID = dtSubFilterData.Rows[i][2].ToString();
                        string strGenreImagePath = "/Images/Subgenres/" + strSubgenreID + ".png";
                        if (!File.Exists(HttpContext.Current.Server.MapPath("~/Images/Subgenres/") + strSubgenreID + ".png"))
                        {
                            strGenreImagePath = "/Images/Genres/" + strParentGenreID + ".png";
                        }

                        string strURLDir = "https://en.wikipedia.org/wiki/" + strGenreName;

                        sb.Append("<div id='topGenreCont" + i + "' class='sectionColumn externalItem' data-value='" + strURLDir + "' style='display: flex; flex-direction: column; align-items: center;'>"
                            + "<img runat='server' id='coverTopGen" + i + "' class='coverTopTrack' src='" + strGenreImagePath + "' data-value='" + dtSubFilterData.Rows[i][0].ToString() + "' style='margin-top:20px; height: 110px; max-width:100%; cursor:pointer;  border-radius: 50%' title='" + strGenreName + "'/>"
                            + "<span id = 'SingleSpanGen" + i + "' class = 'divSubContentSpan' data-name='" + strGenreName + "' style='text-align: center;font-size:10px;'>"
                            + "<p class='aTopTrack' data-value='" + strGenreName + "' data-path='" + strGenreImagePath + "' style='text-decoration: none; font-weight:bold;cursor:pointer;margin-top:2px'>" + strGenreName + "</p></span>"
                            + "</div>");
                    }
                }

                sb.Append("</div>");
            }

            List<string> lstCountries = strCountryIDs.Split(';').ToList();
            lstCountries = lstCountries.GroupBy(name => name).OrderByDescending(group => group.Count()).Take(5).Select(group => group.Key).ToList();
            if (lstCountries.Count > 0)
            {
                string strCountries = string.Join(",", lstCountries);
                sb.Append("<div class='sectionRow'>");
                sb.Append("<div id='topCouCont0' class='sectionColumn columnTitle' data-value='' style='display: flex; flex-direction: column; align-items: center;'>"
                                + "<img runat='server' id='coverTopCou0' class='coverTopTrack' src='/Images/Logos/Global%20Sound.png' data-value='' style='margin-top:20px; height: 65px; max-width:100%;'/>"
                                + "<span id = 'SingleSpanArt0' class = 'divSubContentSpan' data-name='' style='text-align: center;font-size:10px;'>"
                                + "<p class='aTopTrack' data-value='' data-path='' style='text-decoration: none; font-weight:bold;cursor:pointer;margin-top:5px'>Origins of your music</p></span>"
                                + "</div>");
                dtSubFilterData = ExtServices.GetRecordByValueList("countries", "couID", strCountries);

                if (dtSubFilterData.Rows.Count > 0)
                {
                    for (int i = 0; i < dtSubFilterData.Rows.Count; i++)
                    {
                        string strCountryName = dtSubFilterData.Rows[i][2].ToString();
                        string strCountryCode = dtSubFilterData.Rows[i][3].ToString();
                        string strCountryPath = "/Images/Flags/" + strCountryCode + ".svg";

                        string strURLDir = "https://en.wikipedia.org/wiki/" + strCountryName;

                        sb.Append("<div id='topCountryCont" + i + "' class='sectionColumn externalItem' data-value='" + strURLDir + "' style='display: flex; flex-direction: column; align-items: center;'>"
                            + "<img runat='server' id='coverTopCou" + i + "' class='coverTopTrack' src='" + strCountryPath + "' data-value='" + dtSubFilterData.Rows[i][0].ToString() + "' style='margin-top:20px; height: 110px; max-width:100%; cursor:pointer;  border-radius: 5%' title='" + strCountryName + "'/>"
                            + "<span id = 'SingleSpanCou" + i + "' class = 'divSubContentSpan' data-name='" + strCountryName + "' style='text-align: center;font-size:10px;'>"
                            + "<p class='aTopTrack' data-value='" + strCountryName + "' data-path='" + strCountryPath + "' style='text-decoration: none; font-weight:bold;cursor:pointer;margin-top:2px'>" + strCountryName + "</p></span>"
                            + "</div>");
                    }
                    sb.Append("</div>");
                }
            }            

            sb.Append("</div>");
            HttpContext.Current.Session["currentDashboard"] = sb.ToString();
            return sb.ToString();
        }

        //public async Task<Release> GetLatestReleaseAsync(string artistId)
        //{
        //    var releases = await client.Releases.BrowseAsync("artist", artistId, limit: 10); // keep limit low
        //    return releases.Results
        //        .Where(r => !string.IsNullOrWhiteSpace(r.Date))
        //        .OrderByDescending(r => DateTime.Parse(r.Date))
        //        .FirstOrDefault();
        //}

        private static async Task<string> GetLatestReleasesHtmlAsync(MusicBrainzClient client, string artistCode)
        {
            var releaseGroups = await client.ReleaseGroups.BrowseAsync("artist", artistCode, limit: 100);
            var latest = releaseGroups.Items.Where(rg => !string.IsNullOrWhiteSpace(rg.FirstReleaseDate)).OrderByDescending(rg => DateTime.Parse(rg.FirstReleaseDate)).FirstOrDefault();
            var releases = await client.Releases.BrowseAsync("artist", artistCode, limit: 10);
            var release2 = await client.Releases.BrowseAsync("artist", artistCode, limit: 1);
            var release = releaseGroups.Items.FirstOrDefault();
            return release != null ? release.Id.ToString() : "";

            //var artistId = await GetArtistIdAsync(artistName);
            //if (artistId == null) return $"<p>No data found for {artistName}</p>";

            //var url = $"https://musicbrainz.org/ws/2/release/?artist={artistId}&limit=1&fmt=json&status=official";
            //var response = await httpClient.GetStringAsync(url);
            //var doc = JsonDocument.Parse(response);

            //var releases = doc.RootElement.GetProperty("releases");
            //if (releases.GetArrayLength() == 0) return $"<p>No releases found for {artistName}</p>";

            //var release = releases[0];
            //return await FormatReleaseHtmlAsync(release, artistName);
        }

        private static async Task<string> GetUpcomingReleasesHtmlAsync(string artistName)
        {
            var artistId = await GetArtistIdAsync(artistName);
            if (artistId == null) return $"<p>No data found for {artistName}</p>";

            var url = $"https://musicbrainz.org/ws/2/release/?artist={artistId}&fmt=json&status=official";
            var response = await httpClient.GetStringAsync(url);
            var doc = JsonDocument.Parse(response);

            var releases = doc.RootElement.GetProperty("releases");
            var upcomingHtml = new StringBuilder();

            foreach (var release in releases.EnumerateArray())
            {
                if (release.TryGetProperty("date", out var dateProp) &&
                    DateTime.TryParse(dateProp.GetString(), out var releaseDate) &&
                    releaseDate > DateTime.Today)
                {
                    upcomingHtml.Append(await FormatReleaseHtmlAsync(release, artistName));
                }
            }

            return upcomingHtml.Length > 0 ? upcomingHtml.ToString() : $"<p>No upcoming releases for {artistName}</p>";
        }

        private static async Task<string> FormatReleaseHtmlAsync(JsonElement release, string artistName)
        {
            string title = release.GetProperty("title").GetString();
            string date = release.TryGetProperty("date", out var dateProp) ? dateProp.GetString() : "Unknown";
            string id = release.GetProperty("id").GetString();
            string imageUrl = await GetCoverArtUrlAsync(id);

            return $@"
        <div class='releaseRow'>
            <img src='{imageUrl}' alt='Cover' class='coverThumb' />
            <div class='releaseInfo'>
                <div class='releaseTitle'>{title}</div>
                <div class='releaseMeta'>{artistName} – {date}</div>
            </div>
        </div>";
        }

        private static async Task<string> GetArtistIdAsync(string artistName)
        {
            var url = $"https://musicbrainz.org/ws/2/artist/?query=artist:{Uri.EscapeDataString(artistName)}&fmt=json";
            var response = await httpClient.GetStringAsync(url);
            var doc = JsonDocument.Parse(response);

            var artists = doc.RootElement.GetProperty("artists");
            if (artists.GetArrayLength() == 0) return null;

            return artists[0].GetProperty("id").GetString();
        }

        private static async Task<string> GetCoverArtUrlAsync(string releaseId)
        {
            try
            {
                var url = $"https://coverartarchive.org/release/{releaseId}";
                var response = await httpClient.GetStringAsync(url);
                var doc = JsonDocument.Parse(response);

                var images = doc.RootElement.GetProperty("images");
                if (images.GetArrayLength() > 0)
                {
                    return images[0].GetProperty("thumbnails").GetProperty("small").GetString();
                }
            }
            catch
            {
                // No cover art found
            }

            return "https://via.placeholder.com/60x60?text=No+Image";
        }

        [WebMethod(EnableSession = true)]
        public static void PokePage()
        {
            // called by client to refresh session
            ExtServices.ODS("Ping");
        }
    }
}