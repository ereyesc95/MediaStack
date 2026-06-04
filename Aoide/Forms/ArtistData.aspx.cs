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

namespace MediaBinger.Forms
{
    public partial class ArtistData : System.Web.UI.Page
    {
        protected void Page_Load(object sender, EventArgs e)
        {
            //retrieve artist data once shown the modal
            //save on click
            string strPersonID = (string)Session["curPersonID"];
            string strArtistID = (string)Session["curArtistID"];

            if (!IsPostBack)
            {
                if (strArtistID != "" && strPersonID != "")
                {
                    string strImageURL = "";
                    DataTable dtPersonData = ExtServices.GetRecordByValue("artists", "artID", strPersonID); //Get Person Data
                    DataTable dtParticipations = ExtServices.GetRecordByValue("artistparticipations", "arpFKartists", strPersonID, "arpStartDates");

                    if (dtPersonData != null)
                    {
                        //Set pic
                        //If file contains ID
                        char charCurInitial = dtPersonData.Rows[0][3].ToString().ToUpper()[0];
                        charCurInitial = Char.IsDigit(charCurInitial) ? '#' : Char.IsSymbol(charCurInitial) ? '' : charCurInitial;
                        if (File.Exists(HttpContext.Current.Server.MapPath("~/Images/Artists/" + charCurInitial + "/") + dtPersonData.Rows[0][3].ToString().Replace('■', ',').Replace('█', '\'') + " (" + dtPersonData.Rows[0][1].ToString() + ").jpg"))
                        {
                            strImageURL = "/Images/Artists/" + charCurInitial + "/" + Uri.EscapeDataString(dtPersonData.Rows[0][3].ToString().Replace('■', ',').Replace('█', '\'') + " (" + dtPersonData.Rows[0][1].ToString() + ").jpg");
                        }

                        if (strImageURL != "")
                        {
                            picPreview.Style.Add("background-image", "url('" + strImageURL + "')");
                            picPreview.Style.Add("border", "0.3px solid " + (string)Session["curColor"]);
                        }
                        // Set data

                        artName.Value = dtPersonData.Rows[0][3].ToString().Replace('■', ',').Replace('█', '\'');
                        artID.Value = dtPersonData.Rows[0][0].ToString();

                        if (dtPersonData.Rows[0][2].ToString() != "")
                        {
                            artLineBirthName.Attributes.Add("style", "display: block");
                            artBirthName.Value = dtPersonData.Rows[0][2].ToString().Replace('■', ',').Replace('█', '\'');
                        }

                        if (dtPersonData.Rows[0][4].ToString() != "")
                        {
                            artLineAlias.Attributes.Add("style", "display: block");
                            artAlias.Value = dtPersonData.Rows[0][4].ToString().Replace('■', ',').Replace('█', '\'').Replace(";", " • ");
                        }

                        if (dtPersonData.Rows[0][7].ToString() != "")
                        {
                            //Get country code
                            DataTable dtCountry = ExtServices.GetRecordByValue("countries", " couID", dtPersonData.Rows[0][7].ToString().Split('[')[0]);
                            artLineOrigin.Attributes.Add("style", "display: block");

                            string strContent = "<span style='margin-left:10px'><img src='/Images/Flags/" + dtCountry.Rows[0][3].ToString() + ".svg' width=35px' style='margin-top:-5px; margin-right:5px'/>";

                            if (dtPersonData.Rows[0][7].ToString() != "")
                            {
                                string strCity = "";
                                if (dtPersonData.Rows[0][6].ToString().Contains("["))
                                {
                                    strCity = dtPersonData.Rows[0][6].ToString() != "" ? dtPersonData.Rows[0][6].ToString().Split('[')[1] : "";
                                }
                                else
                                {
                                    strCity = dtPersonData.Rows[0][6].ToString() != "" ? dtPersonData.Rows[0][6].ToString() : "";
                                }
                                
                                strContent = strCity != "" ? strContent + " <a class='coloredText linkText' target='_blank' href='https://musicbrainz.org/area/" + strCity.Remove(strCity.Length - 1) + "' style='font-weight: bold; color: " + (string)Session["curColor"] + "'>" + dtPersonData.Rows[0][6].ToString().Split('[')[0] + "</a>," : strContent;
                            }

                            string strCountry = dtPersonData.Rows[0][7].ToString() != "" ? dtPersonData.Rows[0][7].ToString().Split('[')[1] : "";
                            strContent = strCountry != "" ? strContent + " <a class='coloredText linkText' target='_blank' href='https://musicbrainz.org/area/" + strCountry.Remove(strCountry.Length - 1) + "' style='font-weight: bold; color: " + (string)Session["curColor"] + "'>" + dtCountry.Rows[0][2].ToString() + "</a></span>" : strContent + "</span>";

                            if (strCountry != "")
                            {
                                divOrigin.Attributes.Add("style", "display: inline-block");
                                divOrigin.InnerHtml = strContent;
                                artCountry.Value = dtCountry.Rows[0][2].ToString();
                                artCity.Value = dtPersonData.Rows[0][6].ToString().Split('[')[0];
                            }
                        }

                        //Dates
                        if (dtPersonData.Rows[0][5].ToString() != "")
                        {
                            dtBirthDate.Value = dtPersonData.Rows[0][5].ToString();
                            dtDeathDate.Value = dtPersonData.Rows[0][8].ToString();
                            artLineAge.Attributes.Add("style", "display: block");
                            TimeSpan tsDifference = dtPersonData.Rows[0][8].ToString() == "" ? DateTime.UtcNow.Subtract(Convert.ToDateTime(dtPersonData.Rows[0][5].ToString())) : Convert.ToDateTime(dtPersonData.Rows[0][8].ToString()).Subtract(Convert.ToDateTime(dtPersonData.Rows[0][5].ToString()));
                            var firstDay = new DateTime(1, 1, 1);
                            int totalYears = (firstDay + tsDifference).Year - 1;
                            artAge.Value = dtPersonData.Rows[0][8].ToString() == "" ? totalYears + " years old (born in " + Convert.ToDateTime(dtPersonData.Rows[0][5].ToString()).ToString("MMM dd, yyyy") + ")" : totalYears + " years old (" + Convert.ToDateTime(dtPersonData.Rows[0][5].ToString()).ToString("MMM dd, yyyy") + " ─ " + Convert.ToDateTime(dtPersonData.Rows[0][8].ToString()).ToString("MMM dd, yyyy") + ")";
                        }
                    }

                    //New members
                    else if (strPersonID == "0")
                    {
                        picPreview.Style.Add("border", "0.3px solid " + (string)Session["curColor"]);
                        string strFields = "<span class='spanArtLabel modalSpanSecond'>Related Projects: </span><a runat='server' id='artPartAdd' class='btn btn-mini' title='Add' style='color: aliceblue;opacity:0.4; float:right; margin-right:-50px' href='javascript:void(0)'><i class='fa fa-plus' aria-hidden='true'></i></a><p style='font-size:8px'>(Separate entries with / for multiple values) </p><table border='0' id='artPartTable' class='artPartTable' style='margin-top:-10px'>";


                        strFields = strFields + "<tr id='artPartRowOld0' class='artPartRow artPartRowOld' data-id='0' data-code='' style='margin-left-5px'>" +
                               "<td class='artTD artTDProject' style='line-height: 1px'><input id = 'artPartProjectOld0' type = 'text' class='inputFieldTertiary artDataField artParticipation artPartProject' style='width:120px;font-weight:bold' placeholder='Project' value=''/></td>" +
                               "<td class='artTD artTDStart ' style='line-height: 1px'><input id = 'artPartStartOld0' type='text' class='inputFieldTertiary artDataField artParticipation artPartStart' style='width:50px' placeholder='Start date' value=''/></td>" +
                               "<td class='artTD artTDEnd' style='line-height: 1px'><input id = 'artPartEndOld0' type='text' class='inputFieldTertiary artDataField artParticipation artPartEnd' style='width:50px' placeholder='End date' value=''/></td>" +
                               "<td class='artTD artTDType' style='line-height: 1px'><input id = 'artPartTypeOld0' type='text' class='inputFieldTertiary artDataField artParticipation artPartType' style='width:80px' placeholder='Type' value=''/></td>" +
                               "<td class='artTD artTDRole' style='line-height: 1px'><input id = 'artPartRoleOld0' type='text' class='inputFieldTertiary artDataField artParticipation artPartRole' style='width:90px' placeholder='Role' value=''/></td>" +
                               "<td class='artTD artTDDel' style='line-height: 1px;opacity:0.4'><a id='artPartDelOld0' class='artPartDel' title='Remove' style='color: aliceblue;font-size:8px' href='javascript:void(0)'><i class='fa fa-minus' aria-hidden='true'></i></a></td>" +
                               "<td class='artTD artTDCheck' style='line-height: 1px'><input id = 'artPartCheckOld0'type='text' class='inputFieldTertiary artDataField artParticipation artPartCheck' style='display:none' value='O' /></td></tr></table>";

                        artLineParticipations.InnerHtml = strFields;

                    }

                    if (dtParticipations != null && dtParticipations.Rows.Count > 0)
                    {
                        string strContent = "";
                        string strFields = "<span class='spanArtLabel modalSpanSecond' style='font-size:12px'>Related Projects: </span><a runat='server' id='artPartAdd' class='btn btn-mini' title='Add' style='color: aliceblue;opacity:0.4; float:right; margin-right:-50px' href='javascript:void(0)'><i class='fa fa-plus' aria-hidden='true'></i></a><p style='font-size:8px'>(Separate entries with / for multiple values) </p><table border='0' id='artPartTable' class='artPartTable' style='margin-top:-10px; font-size:12px'>";

                        for (int i = 0; i < dtParticipations.Rows.Count; i++)
                        {
                            DataTable dtBands = ExtServices.GetRecordByValue("bands", "bndID", dtParticipations.Rows[i][1].ToString());

                            string strTypes = "";
                            string[] strArtType = dtParticipations.Rows[i][5].ToString().Split(';');
                            foreach (string type in strArtType)
                            {
                                if (type != "")
                                {
                                    DataTable dtTypes = ExtServices.GetRecordByValue("participationtypes", "parID", type);
                                    string strCurrentType = dtTypes.Rows[0][1].ToString();
                                    if (strCurrentType == "Original")
                                    {
                                        strCurrentType = "Official";
                                    }
                                    else if (strCurrentType == "Official")
                                    {
                                        strCurrentType = "Original";
                                    }
                                    strTypes = strTypes != "" ? strTypes + "/" + strCurrentType : strCurrentType;
                                }
                            }

                            string strRoles = "";
                            string[] strArtRole = dtParticipations.Rows[i][6].ToString().Split(';');
                            foreach (string role in strArtRole)
                            {
                                if (role != "")
                                {
                                    DataTable dtRoles = ExtServices.GetRecordByValue("instruments", "insID", role);
                                    strRoles = strRoles != "" ? strRoles + "/" + dtRoles.Rows[0][1].ToString() : dtRoles.Rows[0][1].ToString();
                                }
                            }

                            if (dtBands != null && dtBands.Rows.Count > 0)
                            {
                                if (dtBands.Rows[0][0].ToString() != strArtistID.Replace(" ", ""))
                                {
                                    strContent = strContent == "" ? "<a id='relProject" + i + "' data-id='" + dtBands.Rows[0][0].ToString() + "' data-code='" + dtBands.Rows[0][2].ToString() + "' class='relProject' href='javascript:void(0)' style='font-weight: bold; color: " + (string)Session["curColor"] + "'>" + dtBands.Rows[0][1].ToString() + "</a>" : strContent + " • <a id='bndRelProject" + i + "' data-id='" + dtBands.Rows[0][0].ToString() + "' data-code='" + dtBands.Rows[0][2].ToString() + "' class='relProject' href='javascript:void(0)' style='font-weight: bold; color: " + (string)Session["curColor"] + "'>" + dtBands.Rows[0][1].ToString() + "</a>";
                                }

                                strFields = strFields + "<tr id='artPartRowOld" + i + "' class='artPartRow artPartRowOld' data-id='" + dtBands.Rows[0][0].ToString() + "' data-code='" + dtBands.Rows[0][2].ToString() + "' style='margin-left-5px;'>" +
                                    "<td class='artTD artTDProject' style='line-height: 1px'><input id = 'artPartProjectOld" + i + "' type = 'text' class='inputFieldTertiary artDataField artParticipation artPartProject' style='width:120px;font-weight:bold' placeholder='Project' value='" + dtBands.Rows[0][1].ToString() + "'/></td>" +
                                    "<td class='artTD artTDStart ' style='line-height: 1px'><input id = 'artPartStartOld" + i + "' type='text' class='inputFieldTertiary artDataField artParticipation artPartStart' style='width:50px' placeholder='Start date' value='" + dtParticipations.Rows[i][3].ToString().Replace(';', '/') + "'/></td>" +
                                    "<td class='artTD artTDEnd' style='line-height: 1px'><input id = 'artPartEndOld" + i + "' type='text' class='inputFieldTertiary artDataField artParticipation artPartEnd' style='width:50px' placeholder='End date' value='" + dtParticipations.Rows[i][4].ToString().Replace(';', '/') + "'/></td>" +
                                    "<td class='artTD artTDType' style='line-height: 1px'><input id = 'artPartTypeOld" + i + "' type='text' class='inputFieldTertiary artDataField artParticipation artPartType' style='width:80px' placeholder='Type' value='" + strTypes + "'/></td>" +
                                    "<td class='artTD artTDRole' style='line-height: 1px'><input id = 'artPartRoleOld" + i + "' type='text' class='inputFieldTertiary artDataField artParticipation artPartRole' style='width:90px' placeholder='Role' value='" + strRoles + "'/></td>" +
                                    "<td class='artTD artTDDel' style='line-height: 1px;opacity:0.4'><a id='artPartDelOld' class='artPartDel' title='Remove' style='color: aliceblue;font-size:8px' href='javascript:void(0)'><i class='fa fa-minus' aria-hidden='true'></i></a></td>" +
                                    "<td class='artTD artTDCheck' style='line-height: 1px'><input id = 'artPartCheckOld" + i + "'type='text' class='inputFieldTertiary artDataField artParticipation artPartCheck' style='display:none' value='O' /></td></tr>";
                            }
                        }
                        if (strContent != "")
                        {
                            artLineProjects.Attributes.Add("style", "display: block");
                            divRelated.Attributes.Add("style", "display: inline-block");
                            divRelated.Attributes.Add("style", "font-size: 12px");
                            divRelated.InnerHtml = strContent.Replace('■', ',').Replace('█', '\'');
                        }

                        strFields = strFields + "</table>";
                        artLineParticipations.InnerHtml = strFields.Replace('■', ',').Replace('█', '\'');
                    }
                }
            }
        }

        protected void submit_Click(object sender, EventArgs e)
        {
            try
            {
                //Check userName Existance
                DataTable dtUser = ExtServices.GetUserByUserNameOrMail(Request.Form.Get("usrName").ToString(), Request.Form.Get("usrMail").ToString());

                //If username doesn't exist
                if (dtUser == null || dtUser.Rows.Count == 0)
                {
                    //If passwords coincide
                    if (Request.Form.Get("usrPassword").ToString() == Request.Form.Get("usrRepPassword").ToString())
                    {
                        var encodedPass = System.Text.Encoding.UTF8.GetBytes(Request.Form.Get("usrPassword").ToString());

                        List<string> lstData = new List<string>();
                        lstData.Add(Request.Form.Get("usrName").ToString());
                        lstData.Add(Request.Form.Get("usrBirthDate").ToString());
                        lstData.Add(Convert.ToBase64String(encodedPass).ToString());
                        lstData.Add(Request.Form.Get("usrMail").ToString());
                        lstData.Add(Request.Form.Get("usrFirstName").ToString());
                        lstData.Add(Request.Form.Get("usrLastName").ToString());

                        lstData.Add(DateTime.Now.ToString());


                        bool bolCreateUser = ExtServices.CreateUser(lstData);

                        //User Image
                        if (bolCreateUser && usrImage.HasFile)
                        {
                            //If diectory doesn't exist
                            if (!Directory.Exists(@"Images\Users\"))
                            {
                                Directory.CreateDirectory(@"Images\Users\");
                            }

                            usrImage.SaveAs(Server.MapPath("~/Images/Users/") + Request.Form.Get("usrName").ToString() + Path.GetExtension(usrImage.FileName));
                        }

                        Response.Write("<script>alert('User registered successfully')</script>");
                    }
                    //If passwords don't coincide
                    else
                    {
                        Response.Write("<script>alert('Passwords don't coincide!')</script>");
                    }
                }
                //If username exists
                else
                {
                    Response.Write("<script>alert('User already registered')</script>");
                }
            }

            //In case of errors
            catch (Exception ex)
            {
                Response.Write("<script>alert('" + ex.Message + "')</script>");
                return;
            }

        }

        protected void retrieve_Click(object sender, EventArgs e)
        {

            try
            {


            }
            catch (Exception ex)
            {
                Response.Write("<script>alert('" + ex.Message + "')</script>");
            }
            //            GridView1.DataSource = dt;
            //          GridView1.DataBind();
        }

        [System.Web.Services.WebMethod]
        public static string GetSessionVariable(string strVariable)
        {
            return HttpContext.Current.Session[strVariable].ToString();
        }

        [System.Web.Services.WebMethod]
        public static string SaveArtistChanges(string strData = "", string strParticipationsOld = "", string strParticipationsNew = "")
        {

            string strResult = "";
            string strNewArtistID = "";
            string[] strChars = new[] { "b", "c", "d", "e", "f", "g" };
            Dictionary<string, string> dicData = strData.Split(new[] { '^' }, StringSplitOptions.RemoveEmptyEntries)
               .Select(part => part.Split('>'))
               .ToDictionary(split => split[0], split => split[1]);

            //Update main data
            //Get artist data by id
            DataTable dtArtist = ExtServices.GetRecordByValue("artists", dicData["0"].Split('@')[0], dicData["0"].Split('@')[1]);

            if (dtArtist != null && dtArtist.Rows.Count > 0)
            {
                for (int i = 2; i < dicData.Count + 1 ; i++)
                {
                    string strNewValue = dicData["" + i + ""].Split('@')[1].Replace(',', '■').Replace('\'', '█').Replace('/', ';');
                    string strValueOriginal = dtArtist.Rows[0][i].ToString();

                    // City and country
                    if (i == 6 || i == 7)
                    {
                        int start = strValueOriginal.LastIndexOf("[") + "[".Length;
                        int end = strValueOriginal.IndexOf("]", start);
                        string result = strValueOriginal.Contains("[") ? strValueOriginal.Remove(start, end - start).Replace("[]","") : strValueOriginal;

                        //Fetch country by ID
                        if (i == 7 && result != "")
                        {
                            DataTable dtCountry = ExtServices.GetRecordByValue("countries", "couID", result);
                            if (dtCountry != null && dtCountry.Rows.Count > 0)
                            {
                                result = dtCountry.Rows[0][2].ToString();
                            }

                        }
                        strValueOriginal = result;
                    }


                    if (strNewValue != strValueOriginal)
                    {
                        //Retrieve code for country and city

                        if (!strNewValue.Contains("[") && (i == 6 || i == 7))
                        {
                            //Fetch country by ID
                            if (i == 7)
                            {
                                DataTable dtCountry = ExtServices.GetRecordByValue("countries", "couName", strNewValue);
                                if (dtCountry != null && dtCountry.Rows.Count > 0)
                                {
                                    strNewValue = dtCountry.Rows[0][0].ToString();
                                }
                            }

                            DataTable dtPlaceCode = i == 6 ?  ExtServices.GetRecordLikeValue("bands", "bndOriginPlace", strNewValue) : ExtServices.GetRecordLikeValue("bands", "bndFKcountries", strNewValue);

                            if (dtPlaceCode != null && dtPlaceCode.Rows.Count > 0)
                            {
                                strNewValue = i == 6 ? dtPlaceCode.Rows[0][4].ToString() : dtPlaceCode.Rows[0][5].ToString();
                            }
                        }

                        ExtServices.UpdateSingleFieldByID("artists", strNewValue, dicData["" + i + ""].Split('@')[0], "artID", Convert.ToInt32(dicData["0"].Split('@')[1]));
                    }
                }

            }

            //Inserting new artist
            else
            {

                DataTable dtArtistByStageName = ExtServices.GetRecordByValue("artists", dicData["3"].Split('@')[0], dicData["3"].Split('@')[1]);

                //If artist doesn't exist
                if (dtArtistByStageName == null)
                {
                    List<string> lstArtistColsNew = new List<string>();
                    List<string> lstArtistValsNew = new List<string>();
                    string strArtCode = "";
                    string strArtStageName = "";
                    for (int i = 2; i < dicData.Count + 1; i++)
                    {
                        string strFieldName = dicData["" + i + ""].Split('@')[0];
                        string strFieldValue = dicData["" + i + ""].Split('@')[1].Replace(',', '■').Replace('\'', '█').Replace('/', ';');

                        if (i == 3)
                        {
                            //Retrieve codes and assign to strNewValue
                            //Get code from MusicBrainz
                            MusicBrainzClient client = new MusicBrainzClient();
                            Task<string> taskId = Task.Run(() => PrimaryPage.GetItemId(client, strFieldValue));
                            taskId.Wait();
                            strArtCode = taskId.Result;
                            strArtStageName = strFieldValue;
                        }

                        if  (i == 6 || i == 7)
                        {
                            //Fetch country by ID
                            if (i == 7)
                            {
                                DataTable dtCountry = ExtServices.GetRecordByValue("countries", "couName", strFieldValue);
                                if (dtCountry != null && dtCountry.Rows.Count > 0)
                                {
                                    strFieldValue = dtCountry.Rows[0][0].ToString();
                                }
                            }

                            DataTable dtPlaceCode = i == 6 ? ExtServices.GetRecordLikeValue("bands", "bndOriginPlace", strFieldValue) : ExtServices.GetRecordLikeValue("bands", "bndFKcountries", strFieldValue);

                            if (dtPlaceCode != null && dtPlaceCode.Rows.Count > 0)
                            {
                                strFieldValue = i == 6 ? dtPlaceCode.Rows[0][4].ToString() : dtPlaceCode.Rows[0][5].ToString();
                            }
                        }

                        if (strFieldName != "" && strFieldValue != "")
                        {
                            lstArtistColsNew.Add(strFieldName);
                            lstArtistValsNew.Add(strFieldValue);
                        }
                    }
                    //Write values
                    if (lstArtistColsNew.Count > 0)
                    {
                        if (strArtCode != "")
                        {
                            lstArtistColsNew.Add("artCode");
                            lstArtistValsNew.Add(strArtCode);
                        }

                        ExtServices.InsertByTableName("artists", lstArtistColsNew, lstArtistValsNew);
                        DataTable dtNewArtist = ExtServices.GetRecordByValues("artists", "artCode", strArtCode, "artStageName", strArtStageName);
                        if (dtNewArtist != null && dtNewArtist.Rows.Count > 0)
                        {
                            strNewArtistID = dtNewArtist.Rows[0][0].ToString();
                        }
                    }
                }
                else if (dtArtistByStageName.Rows.Count > 0)
                {
                    //Get ID
                    strNewArtistID = dtArtistByStageName.Rows[0][0].ToString();
                }
                
            }

            //Update old participations

            if (strParticipationsOld != "" && strNewArtistID == "")
            {
                string[] strOldParticipations = strParticipationsOld.Split('*');
                int intCount = 0;
                int intCountOldRow = 0;
                int intCountOldField = 0;
                string strSwitchArtist = "";

                foreach (string participationOld in strOldParticipations)
                {
                    List<string> lstArtistColsOld = new List<string>();
                    List<string> lstArtistValsOld = new List<string>();
                    Dictionary<string, string> dicOldParticipation = participationOld.Split(new[] { '^' }, StringSplitOptions.RemoveEmptyEntries)
                   .Select(part => part.Split('>'))
                   .ToDictionary(split => split[0], split => split[1]);

                    DataTable dtParticipations = ExtServices.GetRecordByValues("artistparticipations", "arpFKbands", HttpContext.Current.Session["curArtistID"].ToString().ToString().Replace(" ", ""), "arpFKartists", dicData["0"].Split('@')[1]);

                    if (dtParticipations == null && dicData["0"].Split('@')[1] == "" && strNewArtistID != "")
                    {
                        dtParticipations = ExtServices.GetRecordByValues("artistparticipations", "arpFKbands", HttpContext.Current.Session["curArtistID"].ToString().ToString().Replace(" ", ""), "arpFKartists", strNewArtistID);
                    }


                    if (dtParticipations != null && dtParticipations.Rows.Count > 0 && dicOldParticipation["g" + intCount].Split('@')[1] == "U")
                    {

                        //check for band existence in DB
                        DataTable dtBand = ExtServices.GetRecordByValue("bands", "bndName", dicOldParticipation["b" + intCountOldRow].Split('@')[1].Replace(',', '■').Replace('\'', '█').Replace('/', ';'));

                        if (dtBand != null && dtBand.Rows.Count > 0)
                        {
                            string strTableName = "";
                            string strFieldTableName = "";
                            //For each field of the row
                            foreach (string Char in strChars)
                            {
                                string strFieldName = dicOldParticipation[Char + intCountOldRow].Split('@')[0];
                                string strFieldValue = dicOldParticipation[Char + intCountOldRow].Split('@')[1].Replace(',', '■').Replace('\'', '█').Replace('/', ';');
                                switch (Char)
                                {
                                    case "b":
                                        strSwitchArtist = dicOldParticipation["a" + intCountOldRow].Split('@')[1] != dtBand.Rows[0][0].ToString() ? dicOldParticipation["a" + intCountOldRow].Split('@')[1] : "";
                                        break;
                                    case "e": //Participation types
                                        strTableName = "participationtypes";
                                        strFieldTableName = "parName";
                                        break;
                                    case "f": //Instruments
                                        strTableName = "instruments";
                                        strFieldTableName = "insName";
                                        break;
                                    default:
                                        break;
                                }

                                if (strTableName != "")
                                {
                                    string[] strNewPartTypes = strFieldValue.Split(';');
                                    strFieldValue = "";
                                    foreach (string partType in strNewPartTypes)
                                    {
                                        DataTable dtFilteredValue = ExtServices.GetRecordByValue(strTableName, strFieldTableName, partType);
                                        string strCurPartType = dtFilteredValue.Rows[0][0].ToString();

                                        if (strCurPartType == "0")
                                        {
                                            strCurPartType = "1";
                                        }
                                        else if (strCurPartType == "1")
                                        {
                                            strCurPartType = "0";
                                        }
                                        if (dtFilteredValue != null && dtFilteredValue.Rows.Count > 0)
                                        {
                                            strFieldValue = strFieldValue == "" ? strCurPartType : strFieldValue + ";" + strCurPartType;
                                        }
                                    }
                                    strTableName = "";
                                }
                                strFieldValue = Char == "b" ? dtBand.Rows[0][0].ToString() : strFieldValue;

                                if (Char != "g")
                                {

                                    lstArtistColsOld.Add(strFieldName);
                                    lstArtistValsOld.Add(strFieldValue);
                                }

                                intCountOldField++;
                            }

                            //Write values
                            string strCurrentID = dicData["0"].Split('@')[1];
                            if (strCurrentID == "" && strNewArtistID != "")
                            {
                                strCurrentID = strNewArtistID;
                            }

                            if (lstArtistColsOld.Count > 0 && strSwitchArtist == "")
                            {
                                ExtServices.UpdateByRecordID("artistparticipations", lstArtistColsOld, lstArtistValsOld, "arpFKbands", Convert.ToInt32(dtBand.Rows[0][0].ToString()), "arpFKartists", Convert.ToInt32(strCurrentID));
                            }
                            else if (lstArtistColsOld.Count > 0 && strSwitchArtist != "")
                            {
                                ExtServices.UpdateByRecordID("artistparticipations", lstArtistColsOld, lstArtistValsOld, "arpFKbands", Convert.ToInt32(strSwitchArtist), "arpFKartists", Convert.ToInt32(strCurrentID));
                                strSwitchArtist = "";
                            }
                        }
                    }

                    else if (dtParticipations != null && dtParticipations.Rows.Count > 0 && dicOldParticipation["g" + intCount].Split('@')[1] == "D")
                    {
                        DataTable dtBand = ExtServices.GetRecordByValue("bands", "bndName", dicOldParticipation["b" + intCountOldRow].Split('@')[1].Replace(',', '■').Replace('\'', '█').Replace('/', ';'));

                        string strCurrentID = dicData["0"].Split('@')[1];
                        if (strCurrentID == "" && strNewArtistID != "")
                        {
                            strCurrentID = strNewArtistID;
                        }

                        if (dtBand != null && dtBand.Rows.Count > 0)
                        {
                            ExtServices.DeleteByID("artistparticipations", "arpFKbands", Convert.ToInt32(dtBand.Rows[0][0].ToString()), "arpFKartists", Convert.ToInt32(strCurrentID));
                        }
                    }

                    intCountOldRow++;
                    intCount++;
                }
            }

            //If artist is new, first participation row
            if (strParticipationsOld != "" && strNewArtistID != "")
            {
                string[] strNewParticipations = strParticipationsOld.Split('*');
                int intCount = 0;
                int intCountNewRow = 0;
                int intCountNewField = 0;
                //For each new row
                foreach (string participationNew in strNewParticipations)
                {
                    List<string> lstArtistColsNew = new List<string>();
                    List<string> lstArtistValsNew = new List<string>();
                    Dictionary<string, string> dicNewParticipation = participationNew.Split(new[] { '^' }, StringSplitOptions.RemoveEmptyEntries)
                   .Select(part => part.Split('>'))
                   .ToDictionary(split => split[0], split => split[1]);

                    //check for band existence in DB
                    DataTable dtBand = ExtServices.GetRecordByValue("bands", "bndName", dicNewParticipation["b" + intCountNewRow].Split('@')[1].Replace(',', '■').Replace('\'', '█').Replace('/', ';'));

                    //If band is already registered then proceed
                    if (dtBand != null && dtBand.Rows.Count > 0)
                    {
                        string strTableName = "";
                        string strFieldTableName = "";
                        //For each field of the row
                        foreach (string Char in strChars)
                        {
                            string strFieldName = dicNewParticipation[Char + intCountNewRow].Split('@')[0];
                            string strFieldValue = dicNewParticipation[Char + intCountNewRow].Split('@')[1].Replace(',', '■').Replace('\'', '█').Replace('/', ';');
                            switch (Char)
                            {
                                case "e": //Participation types
                                    strTableName = "participationtypes";
                                    strFieldTableName = "parName";
                                    break;
                                case "f": //Instruments
                                    strTableName = "instruments";
                                    strFieldTableName = "insName";
                                    break;
                                default:
                                    break;
                            }

                            if (strTableName != "")
                            {
                                string[] strNewPartTypes = strFieldValue.Split(';');
                                strFieldValue = "";
                                foreach (string partType in strNewPartTypes)
                                {
                                    DataTable dtFilteredValue = ExtServices.GetRecordByValue(strTableName, strFieldTableName, partType);
                                    string strCurPartType = dtFilteredValue.Rows[0][0].ToString();

                                    if (strCurPartType == "0")
                                    {
                                        strCurPartType = "1";
                                    }
                                    else if (strCurPartType == "1")
                                    {
                                        strCurPartType = "0";
                                    }
                                    if (dtFilteredValue != null && dtFilteredValue.Rows.Count > 0)
                                    {
                                        strFieldValue = strFieldValue == "" ? dtFilteredValue.Rows[0][0].ToString() : strFieldValue + ";" + dtFilteredValue.Rows[0][0].ToString();
                                    }
                                }
                                strTableName = "";
                            }

                            strFieldValue = Char == "b" ? dtBand.Rows[0][0].ToString() : strFieldValue;

                            if (Char != "g")
                            {

                                lstArtistColsNew.Add(strFieldName);
                                lstArtistValsNew.Add(strFieldValue);
                            }

                            intCountNewField++;
                        }

                        //Write values
                        if (lstArtistColsNew.Count > 0)
                        {
                            lstArtistColsNew.Add("arpFKartists");
                            lstArtistValsNew.Add(strNewArtistID);
                            ExtServices.InsertByTableName("artistparticipations", lstArtistColsNew, lstArtistValsNew);
                        }
                    }
                    intCountNewRow++;
                    intCount++;
                }
            }

            //Insert new participations
            if (strParticipationsNew != "")
            {
                string[] strNewParticipations = strParticipationsNew.Split('*');
                int intCount = 0;
                int intCountNewRow = 0;
                int intCountNewField = 0;
                //For each new row
                foreach (string participationNew in strNewParticipations)
                {
                    List<string> lstArtistColsNew = new List<string>();
                    List<string> lstArtistValsNew = new List<string>();
                    Dictionary<string, string> dicNewParticipation = participationNew.Split(new[] { '^' }, StringSplitOptions.RemoveEmptyEntries)
                   .Select(part => part.Split('>'))
                   .ToDictionary(split => split[0], split => split[1]);

                    DataTable dtParticipations = ExtServices.GetRecordByValues("artistparticipations", "arpFKbands", HttpContext.Current.Session["curArtistID"].ToString().Replace(" ",""), "arpFKartists", dicData["0"].Split('@')[1]);

                    if (dtParticipations == null && dicData["0"].Split('@')[1] == "" && strNewArtistID != "")
                    {
                        dtParticipations = ExtServices.GetRecordByValues("artistparticipations", "arpFKbands", HttpContext.Current.Session["curArtistID"].ToString().Replace(" ", ""), "arpFKartists", strNewArtistID);
                    }

                    if (strNewArtistID != "")
                    {
                        //check for band existence in DB
                        DataTable dtBand = ExtServices.GetRecordByValue("bands", "bndName", dicNewParticipation["b" + intCountNewRow].Split('@')[1].Replace(',', '■').Replace('\'', '█').Replace('/', ';'));

                        //If band is already registered then proceed
                        if (dtBand != null && dtBand.Rows.Count > 0)
                        {
                            string strTableName = "";
                            string strFieldTableName = "";
                            //For each field of the row
                            foreach (string Char in strChars)
                            {
                                string strFieldName = dicNewParticipation[Char + intCountNewRow].Split('@')[0];
                                string strFieldValue = dicNewParticipation[Char + intCountNewRow].Split('@')[1].Replace(',', '■').Replace('\'', '█').Replace('/', ';');
                                switch (Char)
                                {
                                    case "e": //Participation types
                                        strTableName = "participationtypes";
                                        strFieldTableName = "parName";
                                        break;
                                    case "f": //Instruments
                                        strTableName = "instruments";
                                        strFieldTableName = "insName";
                                        break;
                                    default:
                                        break;
                                }

                                if (strTableName != "")
                                {
                                    string[] strNewPartTypes = strFieldValue.Split(';');
                                    strFieldValue = "";
                                    foreach (string partType in strNewPartTypes)
                                    {
                                        DataTable dtFilteredValue = ExtServices.GetRecordByValue(strTableName, strFieldTableName, partType);
                                        if (dtFilteredValue != null && dtFilteredValue.Rows.Count > 0)
                                        {
                                            strFieldValue = strFieldValue == "" ? dtFilteredValue.Rows[0][0].ToString() : strFieldValue + ";" + dtFilteredValue.Rows[0][0].ToString();
                                        }
                                    }
                                    strTableName = "";
                                }

                                strFieldValue = Char == "b" ? dtBand.Rows[0][0].ToString() : strFieldValue;

                                if (Char != "g")
                                {

                                    lstArtistColsNew.Add(strFieldName);
                                    lstArtistValsNew.Add(strFieldValue);
                                }

                                intCountNewField++;
                            }

                            //Write values
                            if (lstArtistColsNew.Count > 0)
                            {
                                lstArtistColsNew.Add("arpFKartists");
                                lstArtistValsNew.Add(strNewArtistID);
                                ExtServices.InsertByTableName("artistparticipations", lstArtistColsNew, lstArtistValsNew);
                            }

                        }
                    }

                    else if (dtParticipations != null && dtParticipations.Rows.Count > 0 && dicNewParticipation["g" + intCount].Split('@')[1] == "N")
                    {
                        //check for band existence in DB
                        DataTable dtBand = ExtServices.GetRecordByValue("bands", "bndName", dicNewParticipation["b" + intCountNewRow].Split('@')[1].Replace(',', '■').Replace('\'', '█').Replace('/', ';'));

                        //If band is already registered then proceed
                        if (dtBand != null && dtBand.Rows.Count > 0)
                        {
                            string strTableName = "";
                            string strFieldTableName = "";
                            //For each field of the row
                            foreach (string Char in strChars)
                            {
                                string strFieldName = dicNewParticipation[Char + intCountNewRow].Split('@')[0];
                                string strFieldValue = dicNewParticipation[Char + intCountNewRow].Split('@')[1].Replace(',', '■').Replace('\'', '█').Replace('/', ';');
                                switch (Char)
                                {
                                    case "e": //Participation types
                                        strTableName = "participationtypes";
                                        strFieldTableName = "parName";
                                        break;
                                    case "f": //Instruments
                                        strTableName = "instruments";
                                        strFieldTableName = "insName";
                                        break;
                                    default:
                                        break;
                                }

                                if (strTableName != "")
                                {
                                    string[] strNewPartTypes = strFieldValue.Split(';');
                                    strFieldValue = "";
                                    foreach (string partType in strNewPartTypes)
                                    {
                                        DataTable dtFilteredValue = ExtServices.GetRecordByValue(strTableName, strFieldTableName, partType);
                                        if (dtFilteredValue != null && dtFilteredValue.Rows.Count > 0)
                                        {
                                            strFieldValue = strFieldValue == "" ? dtFilteredValue.Rows[0][0].ToString() : strFieldValue + ";" + dtFilteredValue.Rows[0][0].ToString();
                                        }
                                    }
                                    strTableName = "";
                                }

                                strFieldValue = Char == "b" ? dtBand.Rows[0][0].ToString() : strFieldValue;

                                if (Char != "g")
                                {

                                    lstArtistColsNew.Add(strFieldName);
                                    lstArtistValsNew.Add(strFieldValue);
                                }

                                intCountNewField++;
                            }

                            //Write values
                            if (lstArtistColsNew.Count > 0)
                            {
                                lstArtistColsNew.Add("arpFKartists");
                                lstArtistValsNew.Add(dicData["0"].Split('@')[1]);
                                ExtServices.InsertByTableName("artistparticipations", lstArtistColsNew, lstArtistValsNew);
                            }

                        }
                    }
                    intCountNewRow++;
                    intCount++;
                }
            }

            return strResult;
        }
    }
}