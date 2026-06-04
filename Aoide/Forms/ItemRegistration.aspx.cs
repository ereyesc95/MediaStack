using Hqub.MusicBrainz.API;
using Hqub.MusicBrainz.API.Entities;
using MediaBinger;
using Newtonsoft.Json.Linq;
using System;
using System.Collections;
using System.Collections.Generic;
using System.Data;
using System.IO;
using System.Linq;
using System.Net;
using System.Threading.Tasks;
using System.Web;
using System.Web.Script.Serialization;
using System.Web.UI;
using System.Web.UI.WebControls;
using System.Windows.Forms;

namespace Aoide.Forms
{
    public partial class ItemRegistration : System.Web.UI.Page
    {
        protected void Page_Load(object sender, EventArgs e)
        {

        }

        protected void Add_Code(object sender, EventArgs e)
        {
            try
            {
                switch (HttpContext.Current.Session["curPageName"].ToString())
                {
                    case "Music":
                        divInsertCode.Style.Add("display", "none");
                        divCheckCode.Style.Add("display", "block");
                        EntitySourceLink.HRef = "https://musicbrainz.org/" + Session["curPageFilter"].ToString() + "/" + Session["curArtistCode"].ToString();
                        EntitySourceLink.InnerText = Session["curArtistName"].ToString();
                        itmCode.Attributes.Add("placeholder", Session["curArtistCode"].ToString());
                        divCheckCode.Style.Add("display", "none");
                        divCloseModal.Style.Add("display", "none");
                        divWait.Style.Add("display", "none");
                        divInsertCode.Style.Add("display", "block");
                        break;
                    default:
                        break;
                }
            }

            //In case of errors
            catch (Exception ex)
            {
                Response.Write("<script>alert('" + ex.Message + "')</script>");
                return;
            }
        }

        protected void Submit_Code(object sender, EventArgs e)
        {
            try
            {
                divWait.Style.Add("display", "block");
                butEntityNext.Style.Add("display", "none");
                if (itmCode.Value.ToString() != "")
                {
                    Register_Data(itmCode.Value.ToString());
                }
                else
                {
                    Register_Data(Session["curArtistCode"].ToString());
                    //Search for item in bands DB
                    DataTable dtBand = ExtServices.GetRecordByValue("bands", "bndCode", Session["curArtistCode"].ToString());
                    if (dtBand != null && dtBand.Rows.Count > 0)
                    {
                        DataTable dtSimilar = ExtServices.GetRecordLikeValue("bands", "bndFKartists", dtBand.Rows[0][1].ToString() + "_not_found");
                        string strRowIDs = "";
                        if (dtSimilar != null && dtSimilar.Rows.Count > 0)
                        {
                            for (int i = 0; i < dtSimilar.Rows.Count; i++)
                            {
                                string[] strSimilar = dtSimilar.Rows[i][8].ToString().Split(';');
                                foreach (string id in strSimilar)
                                {
                                    if (id == dtBand.Rows[i][1].ToString() + "_not_found")
                                    {
                                        strRowIDs = dtSimilar.Rows[i][8].ToString().Replace(id, dtBand.Rows[0][0].ToString());
                                        break;
                                    }
                                }

                                //update value in db
                                if (strRowIDs != dtSimilar.Rows[i][8].ToString() && strRowIDs != "")
                                {
                                    ExtServices.UpdateSingleFieldByID("bands", strRowIDs, "bndFKartists", "bndID", Convert.ToInt32(dtSimilar.Rows[i][0].ToString()));
                                }
                            }
                        }

                        //Update writers features and covers in releases with new bndID
                        DataTable dtReleasesToUpdate = ExtServices.GetRecordLikeValue("releases", "relFKwriters,relFKcovers,relFKfeatures", dtBand.Rows[0][1].ToString() + "_not_found","true");
                        if (dtReleasesToUpdate != null && dtReleasesToUpdate.Rows.Count > 0)
                        {
                            for (int i = 0; i < dtReleasesToUpdate.Rows.Count; i++)
                            {
                                string strWriters = dtReleasesToUpdate.Rows[i][13].ToString().Replace(dtBand.Rows[0][1].ToString() + "_not_found", dtBand.Rows[0][1].ToString());
                                string strCovers = dtReleasesToUpdate.Rows[i][14].ToString().Replace(dtBand.Rows[0][1].ToString() + "_not_found", dtBand.Rows[0][1].ToString());
                                string strFeatures = dtReleasesToUpdate.Rows[i][15].ToString().Replace(dtBand.Rows[0][1].ToString() + "_not_found", dtBand.Rows[0][1].ToString());
                                List<string> lstCol = new List<string>();
                                List<string> lstVal = new List<string>();

                                if (strWriters != "")
                                {
                                    lstCol.Add("relFKwriters");
                                    lstVal.Add(strWriters);
                                }
                                if (strCovers != "")
                                {
                                    lstCol.Add("relFKcovers");
                                    lstVal.Add(strCovers);
                                }
                                if (strFeatures != "")
                                {
                                    lstCol.Add("relFKfeatures");
                                    lstVal.Add(strFeatures);
                                }
                                ExtServices.UpdateByRecordID("releases", lstCol, lstVal, "relID", Convert.ToInt32(dtReleasesToUpdate.Rows[i][0].ToString()));
                            }
                        }

                        //Update writers features and covers in releases with new bndID
                        DataTable dtArtistParticipationsWriting = ExtServices.GetRecordById("artistparticipations", " arpFKbands", Convert.ToInt32(dtBand.Rows[0][0].ToString()));
                        if (dtArtistParticipationsWriting != null && dtArtistParticipationsWriting.Rows.Count > 0)
                        {
                            List<string> lstArtistIDs = new List<string>();
                            //Get name of artist per artistID
                            for (int i = 0; i < dtArtistParticipationsWriting.Rows.Count; i++)
                            {
                                lstArtistIDs.Add(dtArtistParticipationsWriting.Rows[i][2].ToString());
                                
                            }
                            List<string> lstArtistIDsNoDuplicates = lstArtistIDs.Distinct().ToList();
                            if (lstArtistIDsNoDuplicates.Count > 0)
                            {
                                string strArtistIDs = string.Join(";", lstArtistIDsNoDuplicates);
                                DataTable dtArtistNames = ExtServices.GetRecordByValueList("artists", "artID", strArtistIDs);
                                if (dtArtistNames != null && dtArtistNames.Rows.Count > 0)
                                {
                                    string strArtistNames = "";
                                    string strArtistIDList = "";
                                    for (int i = 0; i < dtArtistNames.Rows.Count; i++)
                                    {
                                        strArtistNames = strArtistNames == "" ? dtArtistNames.Rows[i][3].ToString() + "_not_found" : strArtistNames + ";" + dtArtistNames.Rows[i][3].ToString() + "_not_found";
                                        strArtistIDList = strArtistIDList == "" ? dtArtistNames.Rows[i][0].ToString() : strArtistNames + ";" + dtArtistNames.Rows[i][0].ToString();
                                    }
                                    //Get writing credits with the list of names
                                    if (strArtistNames != "")
                                    {
                                        DataTable dtReleaseArtists = ExtServices.GetRecordByValueList("releases", "relFKwriters", strArtistNames);
                                        string[] strArtistNamesArr = strArtistNames.Split(';');
                                        string[] strArtistIDArr = strArtistIDList.Split(';');
                                        if (dtReleaseArtists != null && dtReleaseArtists.Rows.Count > 0)
                                        {
                                            for (int i = 0; i < dtReleaseArtists.Rows.Count; i++)
                                            {
                                                for (int j = 0; j < strArtistNamesArr.Length; i++)
                                                {
                                                    if (dtReleaseArtists.Rows[i][13].ToString().Contains(strArtistNamesArr[j]))
                                                    {
                                                        string strWriters = dtReleaseArtists.Rows[i][13].ToString().Replace(strArtistNamesArr[j], strArtistIDArr[j]);
                                                        List<string> lstCol = new List<string>();
                                                        List<string> lstVal = new List<string>();

                                                        if (strWriters != "")
                                                        {
                                                            lstCol.Add("relFKwriters");
                                                            lstVal.Add(strWriters);
                                                            ExtServices.UpdateByRecordID("releases", lstCol, lstVal, "relID", Convert.ToInt32(dtReleasesToUpdate.Rows[i][0].ToString()));
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                divWait.Style.Add("display", "none");
                divCheckCode.Style.Add("display", "none");
                divInsertCode.Style.Add("display", "none");
                divCloseModal.Style.Add("display", "block");

                //Page.Response.Redirect(Page.Request.Url.ToString(), true);
                //Response.Redirect("~/Media/" + HttpContext.Current.Session["curPageName"].ToString() + "/" + HttpContext.Current.Session["curArtistName"].ToString());
            }

            //In case of errors
            catch (Exception ex)
            {
                Response.Write("<script>alert('" + ex.Message + "')</script>");
                return;
            }
        }

        private void Register_Data(string strItemCode = "")
        {
            butEntityNext.Style.Add("display", "none");
            divWait.Style.Add("display", "block");

            switch (HttpContext.Current.Session["curPageName"].ToString())
            {
                case "Music":
                    //Validate item code
                    MusicBrainzClient client = new MusicBrainzClient();
                    Task<Artist> tsArtist = Task.Run(() => PrimaryPage.ValidateItemId(client, strItemCode, "artist"));
                    tsArtist.Wait();
                    if (tsArtist.Result != null)
                    {
                        //Get column names from current main table 
                        DataTable dtColumns = HttpContext.Current.Session["curPageTable"].ToString() != "" ? ExtServices.GetTableColumns(HttpContext.Current.Session["curPageTable"].ToString()) : new DataTable();
                        DataTable dtBand = ExtServices.GetRecordByValue(HttpContext.Current.Session["curPageTable"].ToString(), "bndCode", tsArtist.Result.Id.ToString());
                        if (dtBand == null)
                        {
                            dtBand = ExtServices.GetRecordByValue(HttpContext.Current.Session["curPageTable"].ToString(), "bndCode", HttpContext.Current.Session["curArtistCode"].ToString());
                        }
                        //IN CASE OF ERROR ADD DEBUG ON LINES 113 AND 136, THE ERROR OCCURS DUE TO LARGE AMMOUNT OF MEMBERS
                        for (int i = 0; i < dtColumns.Rows.Count ; i++)
                        {
                            string strSubTableName = dtColumns.Rows[i][0].ToString().Replace("bndFK", "");

                            switch (strSubTableName)
                            {
                                case "artists":
                                    DataTable dtSubColumns = strSubTableName != "" ? ExtServices.GetTableColumns(strSubTableName) : new DataTable();
                                    string[] strSubColumnNames = new string[dtSubColumns.Rows.Count];

                                    //Store column names in an array
                                    for (int j = 0; j < dtSubColumns.Rows.Count; j++)
                                    {
                                        strSubColumnNames[j] = dtSubColumns.Rows[j][0].ToString();
                                    }

                                    var members = tsArtist.Result.Relations.Where(r => r.TargetType == "artist" && !r.Type.Contains("tribute") && !r.Type.Contains("subgroup") && !r.Type.Contains("collaboration"));

                                    if (tsArtist.Result.Type == "Person" && (members == null || members.Count() == 0))
                                    {
                                        members = tsArtist.Result.Relations;
                                    }
                                    int intCountMembersIndex = 0;
                                    foreach (var relation in members)
                                    {
                                        intCountMembersIndex++;
                                        List<string> lstArtistCols = new List<string>();
                                        List<string> lstArtistVals = new List<string>();

                                        //Populate list for artists table
                                        lstArtistCols.Add(strSubColumnNames[1]); //Code
                                        lstArtistVals.Add(tsArtist.Result.Type != "Person" ? relation.Artist.Id.ToString(): tsArtist.Result.Id.ToString());

                                        Task<Artist> tsSubArtist = tsArtist;

                                        if (tsArtist.Result.Type != "Person")
                                        {
                                            tsSubArtist = Task.Run(() => PrimaryPage.ValidateItemId(client, relation.Artist.Id.ToString(), "artist"));
                                            tsSubArtist.Wait();
                                        }

                                        string strName = "";
                                        string strStageName = "";
                                        string strAliases = "";
                                        if (tsSubArtist.Result != null)
                                        {
                                            
                                            if (tsSubArtist.Result.Aliases.Count == 0 && tsSubArtist.Result.Name != null)
                                            {
                                                lstArtistCols.Add(strSubColumnNames[2]); //Name
                                                lstArtistCols.Add(strSubColumnNames[3]); //Stage Name
                                                lstArtistVals.Add(tsSubArtist.Result.Name); //Name
                                                lstArtistVals.Add(tsSubArtist.Result.Name); //Stage Name
                                            }
                                            else if (tsSubArtist.Result.Aliases.Count > 0 && tsSubArtist.Result.Name != null)
                                            {
                                                foreach (var name in tsSubArtist.Result.Aliases)
                                                {
                                                    if (name.Type == "Legal name")
                                                    {
                                                        strName = name.Name.ToString(); //Name
                                                        strStageName = tsSubArtist.Result.Name.ToString(); //Stage Name
                                                        break;
                                                    }
                                                    else
                                                    {
                                                        strName = tsSubArtist.Result.Name.ToString(); //Name
                                                        strStageName = tsSubArtist.Result.Name.ToString(); //Stage Name
                                                    }

                                                }

                                                foreach (var name in tsSubArtist.Result.Aliases)
                                                { 
                                                    strAliases = strAliases == "" ? name.Name.ToString() : strAliases + ";" + name.Name.ToString();
                                                }

                                                if (strName != "")
                                                {
                                                    lstArtistCols.Add(strSubColumnNames[2]); //Name
                                                    
                                                    lstArtistVals.Add(strName); //Aliases
                                                }

                                                if (strStageName != "")
                                                {
                                                    lstArtistCols.Add(strSubColumnNames[3]); //Stage Name
                                                    lstArtistVals.Add(strStageName); //Aliases
                                                }

                                                if (strAliases != "")
                                                {
                                                    lstArtistCols.Add(strSubColumnNames[4]); //Aliases
                                                    lstArtistVals.Add(strAliases); //Aliases
                                                }
                                            }                                            

                                            if (tsSubArtist.Result.LifeSpan.Begin != null)
                                            {
                                                lstArtistCols.Add(strSubColumnNames[5]); //Birthdate
                                                lstArtistVals.Add(tsSubArtist.Result.LifeSpan.Begin);
                                            }

                                            string strBeginArea = "";
                                            if (tsSubArtist.Result.BeginArea != null)
                                            {
                                                strBeginArea = tsSubArtist.Result.BeginArea.Name + "[" + tsSubArtist.Result.BeginArea.Id + "]";

                                                lstArtistCols.Add(strSubColumnNames[6]); //Birth Place
                                                lstArtistVals.Add(strBeginArea);
                                            }
                                            

                                            //Countries
                                            DataTable dtCountries = strSubColumnNames[7] != "" ? ExtServices.GetContentByTableName(strSubColumnNames[7].Substring(strSubColumnNames[7].LastIndexOf("FK") + 2)) : new DataTable();
                                            DataTable dtFiltered = new DataTable();
                                            string strBeginCountry = "";

                                            if (tsSubArtist.Result.Country != null)
                                            {
                                                var varFilteredRows = dtCountries.AsEnumerable().Where(row => tsSubArtist.Result.Country.ToLower().Contains((row.Field<string>("couISO") ?? " ").ToLower())).Distinct();

                                                if (varFilteredRows.Any())
                                                {
                                                    dtFiltered = varFilteredRows.CopyToDataTable();
                                                    dtFiltered = dtFiltered.DefaultView.ToTable();
                                                    lstArtistCols.Add(strSubColumnNames[7]); //Birth Country FK
                                                    strBeginCountry = dtFiltered.Rows[0][0].ToString() + "[" + tsSubArtist.Result.Area.Id + "]";
                                                    lstArtistVals.Add(strBeginCountry); //Birth country
                                                }

                                                if (tsSubArtist.Result.LifeSpan.End != null)
                                                {
                                                    lstArtistCols.Add(strSubColumnNames[8]); //Death date
                                                    lstArtistVals.Add(tsSubArtist.Result.LifeSpan.End);
                                                }

                                                if (tsSubArtist.Result.EndArea != null)
                                                {
                                                    lstArtistCols.Add(strSubColumnNames[9]); //Death place
                                                    lstArtistVals.Add(tsSubArtist.Result.EndArea.Name + "(" + tsSubArtist.Result.EndArea.Id + ")");

                                                }
                                            }

                                            //Voice types
                                            DataTable dtVoiceTypes = strSubColumnNames[11] != "" ? ExtServices.GetContentByTableName(strSubColumnNames[11].Substring(strSubColumnNames[11].LastIndexOf("FK") + 2)) : new DataTable();
                                            foreach (var tag in tsSubArtist.Result.Tags)
                                            {
                                                var varFilteredVoices = dtVoiceTypes.AsEnumerable().Where(row => tag.Name.ToLower() == row.Field<string>("votName").ToLower());
                                                if (varFilteredVoices.Any() && relation.Attributes.Contains("vocals"))
                                                {
                                                    lstArtistCols.Add(strSubColumnNames[11]); //Voice type
                                                    lstArtistVals.Add(tag.Name); //Name
                                                }
                                            }
                                            
                                            //Instruments
                                            
                                            string strInstrumentID = "";
                                            
                                            DataTable dtColInstruments = strSubColumnNames[12] != "" ? ExtServices.GetTableColumns(strSubColumnNames[12].Substring(strSubColumnNames[12].LastIndexOf("FK") + 2)) : new DataTable();
                                            //get instruments from table
                                            DataTable dtInstruments = strSubColumnNames[12] != "" ? ExtServices.GetContentByTableName(strSubColumnNames[12].Substring(strSubColumnNames[12].LastIndexOf("FK") + 2)) : new DataTable();
                                            DataTable dtFilInstruments = new DataTable();

                                            foreach (var instrument in relation.Attributes)
                                            {
                                                var varFilteredInstruments = dtInstruments.AsEnumerable().Where(row => instrument.ToLower() == row.Field<string>("insName").ToLower()).Distinct();
                                                // If instrument is not registered
                                                if (varFilteredInstruments.Any())
                                                {
                                                    dtFilInstruments = varFilteredInstruments.CopyToDataTable();
                                                    dtFilInstruments = dtFilInstruments.DefaultView.ToTable();
                                                    strInstrumentID = strInstrumentID == "" ? dtFilInstruments.Rows[0][0].ToString() : strInstrumentID + ";" + dtFilInstruments.Rows[0][0].ToString();
                                                }
                                            }

                                            if (strInstrumentID != "")
                                            {
                                                lstArtistCols.Add(strSubColumnNames[12]);
                                                lstArtistVals.Add(strInstrumentID); //Instrument code IDs
                                                strInstrumentID = "";
                                            }

                                            //Gender
                                            if (tsSubArtist.Result.Gender != null)
                                            {
                                                DataTable dtGenders = strSubColumnNames[13] != "" ? ExtServices.GetContentByTableName(strSubColumnNames[13].Substring(strSubColumnNames[13].LastIndexOf("FK") + 2)) : new DataTable();
                                                DataTable dtFillGenders = new DataTable();
                                                var varFilteredGenders = dtGenders.AsEnumerable().Where(row => tsSubArtist.Result.Gender.ToLower() == row.Field<string>("gndName").ToLower()).Distinct();
                                                // If instrument is not registered
                                                if (varFilteredGenders.Any())
                                                {
                                                    dtFillGenders = varFilteredGenders.CopyToDataTable();
                                                    dtFillGenders = dtFillGenders.DefaultView.ToTable();
                                                    lstArtistCols.Add(strSubColumnNames[13]);
                                                    lstArtistVals.Add(dtFillGenders.Rows[0][0].ToString());
                                                }
                                            }

                                            //Occupations TBD

                                            //Write in artist table
                                            //If doesn't exist write, else update
                                            DataTable dtArtistEntry = tsArtist.Result.Type != "Person" ? ExtServices.GetRecordByValue("artists", "artCode", relation.Artist.Id.ToString()) : ExtServices.GetRecordByValue("artists", "artCode", tsArtist.Result.Id.ToString());

                                            //Update artist if it already exists
                                            if (dtArtistEntry != null && dtArtistEntry.Rows.Count != 0)
                                            {
                                                ExtServices.UpdateByRecordID("artists", lstArtistCols, lstArtistVals, strSubColumnNames[0].ToString(), Convert.ToInt32(dtArtistEntry.Rows[0][0].ToString()));
                                            }
                                            //Insert new artist if it doesn't exist
                                            else
                                            {
                                                ExtServices.InsertByTableName("artists", lstArtistCols, lstArtistVals);
                                            }

                                            //Role
                                            if (relation.Type.ToString() == "member of band" || relation.Type.ToString().Contains("support") || relation.TargetType.ToString().ToLower() == "artist")
                                            {  
                                                
                                                DataTable dtArtist = tsArtist.Result.Type != "Person" ? ExtServices.GetRecordByValue("artists", "artCode", relation.Artist.Id.ToString()) : ExtServices.GetRecordByValue("artists", "artCode", tsArtist.Result.Id.ToString()); //Get Artist ID

                                                //If artist exists
                                                if (dtArtist != null && dtArtist.Rows.Count != 0)
                                                {
                                                    List<string> lstParticipationCols = new List<string>();
                                                    List<string> lstParticipationVals = new List<string>();

                                                    //Get columns
                                                    DataTable dtColParticipations = ExtServices.GetTableColumns("artistparticipations");
                                                    string[] strColParticipations = new string[dtColParticipations.Rows.Count];
                                                    //Store column names in an array
                                                    for (int j = 0; j < dtColParticipations.Rows.Count; j++)
                                                    {
                                                        strColParticipations[j] = dtColParticipations.Rows[j][0].ToString();
                                                    }

                                                    //Band ID
                                                    
                                                    if (dtBand != null && dtBand.Rows.Count != 0)
                                                    {
                                                        lstParticipationCols.Add(strColParticipations[1]); //Band ID
                                                        lstParticipationVals.Add(dtBand.Rows[0][0].ToString());

                                                        lstParticipationCols.Add(strColParticipations[2]); //Artist ID
                                                        lstParticipationVals.Add(dtArtist.Rows[0][0].ToString());

                                                        DataTable dtParticipations = ExtServices.GetRecordByValues("artistparticipations", "arpFKbands", dtBand.Rows[0][0].ToString(), "arpFKartists", dtArtist.Rows[0][0].ToString());
                                                        dtParticipations = dtParticipations != null ? dtParticipations : new DataTable();

                                                        string strBeginDate = "";
                                                        string strEndDate = "";

                                                        if (tsArtist.Result.Type != "Person")
                                                        {
                                                            strBeginDate = relation.Begin != null ? relation.Begin.ToString() : "";
                                                            strEndDate = relation.End != null ? relation.End.ToString() : "";
                                                        }

                                                        else
                                                        {
                                                            strBeginDate = tsArtist.Result.LifeSpan.Begin != null ? tsArtist.Result.LifeSpan.Begin.ToString() : "";
                                                            strEndDate = tsArtist.Result.LifeSpan.End != null ? tsArtist.Result.LifeSpan.End.ToString() : "";
                                                        }
                                                        

                                                        //Get begin date values
                                                        string strBeginDates = dtParticipations.Rows.Count > 0 ? dtParticipations.Rows[0][3].ToString() : "";
                                                        string strBeginDateValue = strBeginDate != "" ? strBeginDate : "NULL";

                                                        if (strBeginDate != "" && !strBeginDates.Contains(strBeginDate))
                                                        {
                                                            strBeginDates = strBeginDates == "" ? strBeginDateValue : strBeginDates + ";" + strBeginDateValue;
                                                            lstParticipationCols.Add(strColParticipations[3]); //Begin dates
                                                            lstParticipationVals.Add(strBeginDates);
                                                        }

                                                        //Get end date values
                                                        string strEndDates = dtParticipations.Rows.Count > 0 ? dtParticipations.Rows[0][4].ToString() : "";
                                                        string strEndDateValue = strEndDate != "" ? strEndDate : "NULL";

                                                        if (strEndDate != "" && !strEndDates.Contains(strEndDate))
                                                        {
                                                            strEndDates = strEndDates == "" ? strEndDateValue : strEndDates + ";" + strEndDateValue;
                                                            lstParticipationCols.Add(strColParticipations[4]); //End dates
                                                            lstParticipationVals.Add(strEndDates);
                                                        }

                                                        //Participations
                                                        DataTable dtPartTypes = strColParticipations[5] != "" ? ExtServices.GetContentByTableName(strColParticipations[5].Substring(strColParticipations[5].LastIndexOf("FK") + 2)) : new DataTable();
                                                        DataTable dtFillPartTypes = new DataTable();
                                                        string strPartTypeID = "";
                                                        string strInstrumentsID = "";
                                                        int intCountAttr = 0;

                                                        foreach (var attribute in relation.Attributes)
                                                        {
                                                            intCountAttr++;
                                                            var varFilteredPartTypes = dtPartTypes.AsEnumerable().Where(row => attribute.ToLower() == row.Field<string>("parName").ToLower()).Distinct();
                                                            var varFilteredInstruments = dtInstruments.AsEnumerable().Where(row => attribute.ToLower() == row.Field<string>("insName").ToLower()).Distinct();

                                                            if (varFilteredPartTypes.Any())
                                                            {
                                                                dtFillPartTypes = varFilteredPartTypes.CopyToDataTable();
                                                                dtFillPartTypes = dtFillPartTypes.DefaultView.ToTable();
                                                                if (!strPartTypeID.Contains(dtFillPartTypes.Rows[0][0].ToString()))
                                                                {
                                                                    strPartTypeID = strPartTypeID == "" ? dtFillPartTypes.Rows[0][0].ToString() : strPartTypeID + ";" + dtFillPartTypes.Rows[0][0].ToString();
                                                                }
                                                            }

                                                            else if (relation.Type.ToString() == "member of band" && !strPartTypeID.Contains("1"))
                                                            {
                                                                strPartTypeID = strPartTypeID == "" ? "1" : strPartTypeID + ";1"; //Official
                                                            }

                                                            else if (relation.Type.ToString().Contains("support") && !strPartTypeID.Contains("5"))
                                                            {
                                                                strPartTypeID = strPartTypeID == "" ? "5" : strPartTypeID + ";5"; //Supporting
                                                            }

                                                            if (varFilteredInstruments.Any())
                                                            {
                                                                dtFillPartTypes = varFilteredInstruments.CopyToDataTable();
                                                                dtFillPartTypes = dtFillPartTypes.DefaultView.ToTable();
                                                                strInstrumentsID = strInstrumentsID == "" ? dtFillPartTypes.Rows[0][0].ToString() : strInstrumentsID + ";" + dtFillPartTypes.Rows[0][0].ToString();
                                                            }
                                                        }

                                                        if (intCountAttr == 0)
                                                        {
                                                            if (relation.Type.ToString() == "member of band" && !strPartTypeID.Contains("1"))
                                                            {
                                                                strPartTypeID = strPartTypeID == "" ? "1" : strPartTypeID + ";1"; //Official
                                                            }

                                                            else if (relation.Type.ToString().Contains("support") && !strPartTypeID.Contains("5"))
                                                            {
                                                                strPartTypeID = strPartTypeID == "" ? "5" : strPartTypeID + ";5"; //Supporting
                                                            }
                                                        }

                                                        if (strPartTypeID != "")
                                                        {
                                                            lstParticipationCols.Add(strColParticipations[5]); //Participation type
                                                            lstParticipationVals.Add(strPartTypeID);
                                                        }

                                                        if (strInstrumentsID != "")
                                                        {
                                                            lstParticipationCols.Add(strColParticipations[6]); //Instruments
                                                            lstParticipationVals.Add(strInstrumentsID);
                                                        }

                                                        //Writing on participation tables
                                                        //If doesn't exist write, else update
                                                        //Update artist if it already exists
                                                        if (dtParticipations != null && dtParticipations.Rows.Count != 0)
                                                        {
                                                            ExtServices.UpdateByRecordID("artistparticipations", lstParticipationCols, lstParticipationVals, "arpID", Convert.ToInt32(dtParticipations.Rows[0][0].ToString()));
                                                        }
                                                        //Insert new artist if it doesn't exist
                                                        else
                                                        {
                                                            ExtServices.InsertByTableName("artistparticipations", lstParticipationCols, lstParticipationVals);
                                                        }
                                                    }
                                                }
                                            }
                                        }

                                        if (tsArtist.Result.Type == "Person")
                                        {
                                            break;
                                        }

                                    }

                                    //Add band
                                    List<string> lstBandCols = new List<string>();
                                    List<string> lstBandVals = new List<string>();
                                    string strBandAliases = "";

                                    string[] strBndColumnNames = new string[dtColumns.Rows.Count];
                                    //Store column names in an array
                                    for (int j = 0; j < dtColumns.Rows.Count; j++)
                                    {
                                        strBndColumnNames[j] = dtColumns.Rows[j][0].ToString();
                                    }

                                    //Aliases
                                    foreach (var name in tsArtist.Result.Aliases)
                                    {
                                        strBandAliases = strBandAliases == "" ? name.Name.ToString() : strBandAliases + ";" + name.Name.ToString();
                                    }

                                    if (strBandAliases != "")
                                    {
                                        lstBandCols.Add(strBndColumnNames[3]); //Aliases
                                        lstBandVals.Add(strBandAliases); //Aliases
                                    }

                                    //Origin place

                                    string strBndBeginArea = "";
                                    if (tsArtist.Result.BeginArea != null)
                                    {
                                        strBndBeginArea = tsArtist.Result.BeginArea.Name + "[" + tsArtist.Result.BeginArea.Id + "]";

                                        lstBandCols.Add(strBndColumnNames[4]);
                                        lstBandVals.Add(strBndBeginArea);
                                    }

                                    //Origin country

                                    DataTable dtBndCountries = strBndColumnNames[5] != "" ? ExtServices.GetContentByTableName(strBndColumnNames[5].Substring(strBndColumnNames[5].LastIndexOf("FK") + 2)) : new DataTable();
                                    DataTable dtCouFiltered = new DataTable();
                                    string strBeginCountryBnd = "";

                                    if (tsArtist.Result.Country != null)
                                    {
                                        var varFilteredRows = dtBndCountries.AsEnumerable().Where(row => tsArtist.Result.Country.ToLower().Contains((row.Field<string>("couISO") ?? " ").ToLower())).Distinct();

                                        if (varFilteredRows.Any())
                                        {
                                            dtCouFiltered = varFilteredRows.CopyToDataTable();
                                            dtCouFiltered = dtCouFiltered.DefaultView.ToTable();
                                            lstBandCols.Add(strBndColumnNames[5]); 
                                            strBeginCountryBnd = dtCouFiltered.Rows[0][0].ToString() + "[" + tsArtist.Result.Area.Id + "]";
                                            lstBandVals.Add(strBeginCountryBnd);
                                        }
                                    }

                                    //Begin and End dates
                                    if (tsArtist.Result.LifeSpan.Begin != null)
                                    {
                                        lstBandCols.Add(strBndColumnNames[6]);
                                        lstBandVals.Add(tsArtist.Result.LifeSpan.Begin);
                                    }

                                    if (tsArtist.Result.LifeSpan.End != null)
                                    {
                                        lstBandCols.Add(strBndColumnNames[7]);
                                        lstBandVals.Add(tsArtist.Result.LifeSpan.End);
                                    }

                                    //Genres
                                    DataTable dtBndGenres = strBndColumnNames[10] != "" ? ExtServices.GetContentByTableName(strBndColumnNames[10].Substring(strBndColumnNames[10].LastIndexOf("FK") + 2)) : new DataTable();
                                    DataTable dtGenFiltered = new DataTable();
                                    string strBndGenres = "";
                                    string strBndSubGenres = "";

                                    if (tsArtist.Result.Genres != null && tsArtist.Result.Genres.Count > 0)
                                    {
                                        foreach (var genre in tsArtist.Result.Genres)
                                        {
                                            var varFilteredRows = dtBndGenres.AsEnumerable().Where(row => genre.Name.ToLower() == row.Field<string>("sgnName").ToLower()).Distinct();

                                            if (varFilteredRows.Any())
                                            {
                                                dtGenFiltered = varFilteredRows.CopyToDataTable();
                                                dtGenFiltered = dtGenFiltered.DefaultView.ToTable();

                                                //Genres
                                                if (!strBndGenres.Contains(dtGenFiltered.Rows[0][2].ToString()))
                                                {
                                                    strBndGenres = strBndGenres == "" ? dtGenFiltered.Rows[0][2].ToString() : strBndGenres + ";" + dtGenFiltered.Rows[0][2].ToString();
                                                }

                                                //Subgenres
                                                if (!strBndGenres.Contains(dtGenFiltered.Rows[0][0].ToString()))
                                                {
                                                    strBndSubGenres = strBndSubGenres == "" ? dtGenFiltered.Rows[0][0].ToString() : strBndSubGenres + ";" + dtGenFiltered.Rows[0][0].ToString();
                                                }

                                            }
                                        }

                                        if (strBndGenres != "")
                                        {
                                            lstBandCols.Add(strBndColumnNames[9]);
                                            lstBandVals.Add(strBndGenres);
                                        }

                                        if (strBndSubGenres != "")
                                        {
                                            lstBandCols.Add(strBndColumnNames[10]);
                                            lstBandVals.Add(strBndSubGenres);
                                        }

                                    }

                                    //Artist type IF ITS EMPTY ADD ID FROM TSARTIST ID
                                    DataTable dtBandArtists =  ExtServices.GetRecordByValue("artistparticipations", "arpFKbands", dtBand.Rows[0][0].ToString());
                                    


                                    int intCountMembers = 0;

                                    if (dtBandArtists != null && dtBandArtists.Rows.Count > 0)
                                    {
                                        for (int j = 0; j < dtBandArtists.Rows.Count; j++)
                                        {
                                            string[] strBegin = new string[0];
                                            string[] strEnd = new string[0];

                                            if (dtBandArtists.Rows[j][3].ToString() != "" && dtBandArtists.Rows[j][5] != null && (dtBandArtists.Rows[j][5].ToString().Contains("1") || dtBandArtists.Rows[j][5].ToString().Contains("0")))
                                            {
                                                strBegin = dtBandArtists.Rows[j][3].ToString().Split(';');
                                            }

                                            if (dtBandArtists.Rows[j][4].ToString() != "" && dtBandArtists.Rows[j][5] != null && (dtBandArtists.Rows[j][5].ToString().Contains("1") || dtBandArtists.Rows[j][5].ToString().Contains("0")))
                                            {
                                                strEnd = dtBandArtists.Rows[j][4].ToString().Split(';');
                                            }

                                            if (strBegin.Length == strEnd.Length + 1 && strBegin.Length > 0 && strEnd.Length > 0 && Convert.ToInt32(strBegin.Last().Substring(0, 4)) >= Convert.ToInt32(strEnd.Last().Substring(0, 4)))
                                            {
                                                intCountMembers++;
                                            }

                                            else if (strBegin.Length == 1 && strEnd.Length == 0 && Convert.ToInt32(strBegin.Last().Substring(0, 4)) <= Convert.ToInt32(DateTime.Now.Year))
                                            {
                                                intCountMembers++;
                                            }
                                        }
                                    }
                                    else if (tsArtist.Result.Type == "Person")
                                    {
                                        intCountMembers = 1;
                                    }

                                    //Get from artisttypes
                                    DataTable dtArtTypes = strBndColumnNames[11] != "" ? ExtServices.GetContentByTableName(strBndColumnNames[11].Substring(strBndColumnNames[11].LastIndexOf("FK") + 2)) : new DataTable();
                                    DataTable dtArtTypeFiltered = new DataTable();

                                    var varFilteredRowsType = dtArtTypes.AsEnumerable().Where(row => intCountMembers == row.Field<int>("atyID")).Distinct();

                                    if (intCountMembers >= 11)
                                    {
                                        varFilteredRowsType = dtArtTypes.AsEnumerable().Where(row => 11 == row.Field<int>("atyID"));
                                    }

                                    if (varFilteredRowsType.Any())
                                    {
                                        dtArtTypeFiltered = varFilteredRowsType.CopyToDataTable();
                                        dtArtTypeFiltered = dtArtTypeFiltered.DefaultView.ToTable();
                                        lstBandCols.Add(strBndColumnNames[11]);
                                        lstBandVals.Add(dtArtTypeFiltered.Rows[0][0].ToString());
                                    }

                                    //Websites
                                    string strWebsites = "";
                                    //Search websites
                                    DataTable dtWebsites = ExtServices.GetContentByTableName("websites");

                                    var urls = tsArtist.Result.Relations.Where(r => r.TargetType == "url");
                                    foreach (var url in urls)
                                    {
                                        string inputUrl = url.Url.Resource;
                                        var match = dtWebsites.AsEnumerable().FirstOrDefault(row => {
                                            var dbUrl = row.Field<string>("webURL").Replace("www.", "");
                                            return inputUrl.Replace("www.", "").Contains(dbUrl);
                                        });

                                        if (match != null)
                                        {
                                            // Match found: Use DB values
                                            string name = match.Field<string>("webName");
                                            string typeId = match.Field<object>("webTypeID").ToString();
                                            if (!strWebsites.Contains(name))
                                            {
                                                strWebsites = strWebsites == "" ? $"[{name} ({typeId}),{inputUrl}]" : strWebsites + ";" + $"[{name} ({typeId}),{inputUrl}]";
                                            }
                                        }
                                        else
                                        {
                                            // No match: Default to type (1) and use the domain as the name
                                            // Extract domain (e.g., "example.com") for a cleaner look, or just use inputUrl
                                            string domain = new Uri(inputUrl).Host.Replace("www.", "");
                                            if (url.Type != null && url.Type.ToLower() != "fanpage" && url.Type.ToLower() != "online community")
                                            {
                                                //Insert new website
                                                List<string> lstWebsiteCols = new List<string>();
                                                List<string> lstWebsiteVals = new List<string>();
                                                lstWebsiteCols.Add("webname");
                                                if (url.Type == "official homepage")
                                                {
                                                    lstWebsiteVals.Add("Official Website");
                                                }
                                                else
                                                {
                                                    lstWebsiteVals.Add(domain);
                                                }
                                                
                                                lstWebsiteCols.Add("weburl");
                                                lstWebsiteVals.Add(inputUrl);
                                                if (url.Type == "official homepage")
                                                {
                                                    lstWebsiteCols.Add("weblogoid");
                                                    lstWebsiteVals.Add("Official Website");
                                                }
                                                lstWebsiteCols.Add("webtypeid");
                                                if (url.Type == "official homepage")
                                                {
                                                    lstWebsiteVals.Add("2");
                                                }
                                                else
                                                {
                                                    lstWebsiteVals.Add("1");
                                                }

                                                ExtServices.InsertByTableName("websites", lstWebsiteCols, lstWebsiteVals);
                                                dtWebsites = ExtServices.GetContentByTableName("websites");
                                                if (url.Type == "official homepage" && !strWebsites.ToLower().Contains("official website"))
                                                {
                                                    strWebsites = strWebsites == "" ? $"[Official Website (2),{inputUrl}]" : strWebsites + ";" + $"[Official Website (2),{inputUrl}]";
                                                }
                                                else if (url.Type != "official homepage" && !strWebsites.Contains(domain))
                                                {
                                                    strWebsites = strWebsites == "" ? $"[{domain} (1),{inputUrl}]" : strWebsites + ";" + $"[{domain} (1),{inputUrl}]";
                                                }
                                            }
                                        }
                                    }

                                    if (strWebsites != "")
                                    {
                                        strWebsites = strWebsites + ";";
                                    }

                                    string strBandName = dtBand.Rows[0][1].ToString();
                                    string strBandCode = dtBand.Rows[0][2].ToString();
                                    strWebsites = strWebsites + "[Rutracker (5),https://rutracker.org/forum/tracker.php?nm=" + strBandName.Replace(" ","%20") + "]";
                                    strWebsites = strWebsites + ";" + $"[The Pirate Bay (5),https://thepiratebay.org/search.php?q=" + strBandName.Replace(" ", "+") + "&audio=on]";
                                    if (!strWebsites.ToLower().Contains("wikipedia"))
                                    {
                                        string strURL = "https://en.wikipedia.org/wiki/" + strBandName.Replace(" ", "_");

                                        try
                                        {
                                            HttpWebRequest request = WebRequest.Create(strURL) as HttpWebRequest;
                                            request.Method = "HEAD";
                                            HttpWebResponse response = request.GetResponse() as HttpWebResponse;
                                            response.Close();
                                            strWebsites = strWebsites + ";[Wikipedia (6)," + strURL + "]";
                                        }
                                        catch
                                        {
                                            strWebsites = strWebsites + ";[Wikipedia (6)," + strURL + "]";
                                        }
                                    }
                                    if (!strWebsites.ToLower().Contains("genius"))
                                    {
                                        strWebsites = strWebsites + ";[Genius (7),https://genius.com/artists/" + strBandName.Replace(" ", "-") + "]";

                                    }if (!strWebsites.ToLower().Contains("musicbrainz"))
                                    {
                                        strWebsites = strWebsites + ";[MusicBrainz (6),https://musicbrainz.org/artist/" + strBandCode + "]";
                                    }

                                    lstBandCols.Add(strBndColumnNames[12]);
                                    lstBandVals.Add(strWebsites);

                                    //Update band
                                    ExtServices.UpdateByRecordID(HttpContext.Current.Session["curPageTable"].ToString(), lstBandCols, lstBandVals, "bndID", Convert.ToInt32(dtBand.Rows[0][0].ToString()));
                                    HttpContext.Current.Session["curArtistCode"] = dtBand.Rows[0][2].ToString();

                                    break;
                                default:
                                    break;
                            }


                        }

                        
                    }

                    break;
                default:
                    break;
            }
        }

        public static async Task<string> Search(MusicBrainzClient client, string name)
        {
            // Search for an artist by name (limit to 20 matches).
            var artists = await client.Artists.SearchAsync(name, 3);

            Console.WriteLine("Total matches for '{0}': {1}", name, artists.Count);

            // Count matches with score 100.
            int count = artists.Items.Count(a => a.Score == 100);

            Console.WriteLine("Exact matches for '{0}': {1}", name, count);

            // By default, search results will be ordered by score, so to get the
            // best match you could do artists.Items.First(). Sometimes this method
            // won't work (example: search for 'U2').
            // 
            // If the search string is the exact name, it might be better to compare
            // to that string or to order by similarity, like done here:

            //var artist = artists.Items.OrderByDescending(a => Levenshtein.Similarity(a.Name, name)).First();
            var artist = artists.Items.First();

            // Get detailed information of the artist, including band-members and related urls.
            artist = await client.Artists.GetAsync(artist.Id, "artist-rels", "url-rels");

            Console.WriteLine();
            Console.WriteLine("Current band members of '{0}':", artist.Name);
            Console.WriteLine();

            // Band members are represented as artist-artist relationships. To filter relations,
            // inspect "TargetType" and "Type" properties.
            var members = artist.Relations.Where(r => r.TargetType == "artist" && r.Type.Contains("member"));

            foreach (var relation in members.Where(r => !(bool)r.Ended))
            {
                Console.WriteLine("     {0}", relation.Artist.Name);
            }

            // Lyric are represented as artist-url relationships.
            var lyrics = artist.Relations.Where(r => r.TargetType == "url" && r.Type == "lyrics");

            if (lyrics.Count() > 0)
            {
                Console.WriteLine();
                Console.WriteLine("You can find lyrics for '{0}' at", artist.Name);
                Console.WriteLine();

                foreach (var relation in lyrics)
                {
                    Console.WriteLine("     {0}", relation.Url.Resource);
                }
            }
            return "HIM";
        }
    }
}