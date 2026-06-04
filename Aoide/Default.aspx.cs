using DeviceId;
using MySql.Data.MySqlClient;
using System;
using System.Collections.Generic;
using System.Data;
using System.IO;
using System.Linq;
using System.Web;
using System.Web.UI;
using System.Web.UI.WebControls;

namespace MediaBinger
{
    public partial class _Default : Page
    {
        protected void Page_Load(object sender, EventArgs e)
        {
            if (HttpContext.Current.Session["usrID"] != null && HttpContext.Current.Session["usrID"].ToString() != "")
            {
                Response.Redirect("Media");
            }
            else
            {
                //Check machine existence
                string strDevice = new DeviceIdBuilder().AddMachineName().AddMacAddress().AddUserName().ToString();
                DataTable dtMachineData = ExtServices.GetMachine(strDevice);
                if (dtMachineData == null || dtMachineData.Rows.Count == 0)
                {
                    //Register machine
                    ExtServices.CreateMachine(strDevice, DateTime.Now);
                }
            }
        }

        protected void submit_Click(object sender, EventArgs e)
        {
            try
            {
                // If user exists
                DataTable dtUsrData = ExtServices.GetUserData(Request.Form.Get("usrName").ToString(), Request.Form.Get("usrPassword").ToString());
                
                if (dtUsrData != null)
                {
                    string strUsrID = dtUsrData.Rows[0]["usrID"].ToString();
                    //Add login date
                    ExtServices.UpdateUserField(Convert.ToInt32(strUsrID), DateTime.Now);
                    Session["usrID"] = strUsrID;
                    Session["usrLogin"] = 1;
                    Session["usrName"] = Request.Form.Get("usrName").ToString();
                    Session["usrRoleID"] = dtUsrData.Rows[0]["usrRoleID"].ToString();
                    Response.Redirect("~/Media");
                }
                //If user is not found
                else
                {
                    Response.Write("<script>alert('Check your credentials')</script>");
                }

            }

            //In case of errors
            catch (Exception ex)
            {
                Response.Write("<script>alert('" + ex.Message + "')</script>");
                return;
            }

        }
        [System.Web.Services.WebMethod]
        public static string GetSessionVariable(string strVariable)
        {
            return HttpContext.Current.Session[strVariable] != null ? HttpContext.Current.Session[strVariable].ToString(): "0";
        }

        [System.Web.Services.WebMethod]
        public static void UpdateData(string strVariable, string strValue)
        {
            string strDevice = new DeviceIdBuilder().AddMachineName().AddMacAddress().AddUserName().ToString();

            DataTable dtMachineData = ExtServices.GetMachine(strDevice);
            if (dtMachineData != null && dtMachineData.Rows.Count > 0 )
            {
                //Register machine
                ExtServices.UpdateMachine(Convert.ToInt32(dtMachineData.Rows[0]["sysID"]), DateTime.Now);
            }

            if (HttpContext.Current.Session["usrID"] != null && HttpContext.Current.Session["usrLogin"] != null)
            {
                // Update user data
                ExtServices.UpdateUserField(Convert.ToInt32(HttpContext.Current.Session["usrID"]), DateTime.Now);
            }

            HttpContext.Current.Session[strVariable] = strValue;
        }

        [System.Web.Services.WebMethod]
        public static void UpdateSessionVariable(string strVariable, string strValue)
        {
            HttpContext.Current.Session[strVariable] = strValue;
        }

    }
}