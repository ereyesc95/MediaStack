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

namespace MediaBinger.Forms
{
    public partial class UserRegistry : System.Web.UI.Page
    {
        protected void Page_Load(object sender, EventArgs e)
        {        
            string userID = (string)Session["usrID"];

            if (!IsPostBack)
            {
                if (userID == "" || userID == null)
                {
                    //Response.Redirect("~/Default.aspx");
                }
            }

            //Get Genders
            if (usrGender.Items.Count == 1)
            {
                DataTable dtGenders = ExtServices.GetGenders();

                if (dtGenders != null && dtGenders.Rows.Count > 0)
                {
                    for (int i = 0; i < dtGenders.Rows.Count; i++)
                    {
                        usrGender.Items.Add(new ListItem(dtGenders.Rows[i]["gndIcon"].ToString() + ";" + dtGenders.Rows[i]["gndName"].ToString() + ";" + dtGenders.Rows[i]["gndColor"].ToString(), dtGenders.Rows[i]["gndID"].ToString()));
                    }
                }
            }

            //Get Roles
            if (usrRole.Items.Count == 1)
            {
                DataTable dtRoles = ExtServices.GetRoles();

                if (dtRoles != null && dtRoles.Rows.Count > 0)
                {
                    for (int i = 0; i < dtRoles.Rows.Count; i++)
                    {
                        usrRole.Items.Add(new ListItem(dtRoles.Rows[i]["uroName"].ToString(), dtRoles.Rows[i]["uroID"].ToString()));
                    }
                }

            }

            //Get continents
            if (selContinent.Items.Count == 0)
            {
                DataTable dtContinents = ExtServices.GetContinents();

                if (dtContinents != null && dtContinents.Rows.Count > 0)
                {
                    for (int i = 0; i < dtContinents.Rows.Count; i++)
                    {
                        selContinent.Items.Add(new ListItem(dtContinents.Rows[i]["conISO"].ToString() + ';' + dtContinents.Rows[i]["conName"].ToString(), dtContinents.Rows[i]["conID"].ToString()));
                        selContinentBck.Items.Add(new ListItem(dtContinents.Rows[i]["conISO"].ToString() + ';' + dtContinents.Rows[i]["conName"].ToString(), dtContinents.Rows[i]["conID"].ToString()));
                    }
                }
            }

            //Get countries
            if (selCountry.Items.Count == 1)
            {
                DataTable dtCountries = ExtServices.GetCountries();

                if (dtCountries != null && dtCountries.Rows.Count > 0)
                {
                    for (int i = 0; i < dtCountries.Rows.Count; i++)
                    {
                        selCountry.Items.Add(new ListItem(dtCountries.Rows[i]["couMediaTypeID"].ToString() + ';' + dtCountries.Rows[i]["couContinentID"].ToString() + ';' + dtCountries.Rows[i]["couISO"].ToString() + ';' + dtCountries.Rows[i]["couName"].ToString(), dtCountries.Rows[i]["couID"].ToString()));
                    }
                }
            }
        }

        [System.Web.Services.WebMethod]
        public static void getData()
        {

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
                        lstData.Add(usrGender.Value.ToString());
                        lstData.Add(DateTime.Now.ToString());
                        lstData.Add(usrGender.Value.ToString());

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
    }
}