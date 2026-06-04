using MediaBinger;
using System;
using System.Collections.Generic;
using System.Data;
using System.IO;
using System.Linq;
using System.Web;
using System.Web.Services;
using System.Web.UI;
using System.Web.UI.WebControls;

namespace Aoide.Forms
{
    public partial class Home : System.Web.UI.Page
    {
        protected void Page_Load(object sender, EventArgs e)
        {
            //Get content types
            DataTable dtContentTypes = ExtServices.GetContentTypes();
            if (dtContentTypes != null && dtContentTypes.Rows.Count > 0)
            {
                Session["MainPages"] = "";
                //Add values
                for (int i = 0; i < dtContentTypes.Rows.Count; i++)
                {
                    Session["MainPages"] = Session["MainPages"] + ";" + dtContentTypes.Rows[i]["cntID"].ToString() + "-" + dtContentTypes.Rows[i]["cntName"].ToString();

                    menContainer.InnerHtml = menContainer.InnerHtml +
                                             "<div id = 'menBox' class='menu-container' runat='server'>" +
                                             "<div id = 'menButton" + i + "' class='button-menu' data-value='" + dtContentTypes.Rows[i]["cntID"].ToString() + "'>" +
                                             "<span id = 'menSpan" + i + "' class = 'button-span' data-value='" + dtContentTypes.Rows[i]["cntName"].ToString() + "'>" + dtContentTypes.Rows[i]["cntName"].ToString().ToUpper() + "</span>" +
                                             "</div></div>";
                }
            }
        }

        [System.Web.Services.WebMethod]
        public static string LoadNavBar()
        {
            string strUsrRoleID = " 0";
            if (HttpContext.Current.Session["usrRoleID"] != null)
            {
                strUsrRoleID = HttpContext.Current.Session["usrRoleID"].ToString();
            }

            if (HttpContext.Current.Session["usrName"] != null && HttpContext.Current.Session["usrName"].ToString() != "")
            {
                if (File.Exists(HttpContext.Current.Server.MapPath("~/Images/Users/") + HttpContext.Current.Session["usrName"].ToString() + ".jpg"))
                {
                    return "/Images/Users/" + HttpContext.Current.Session["usrName"].ToString() + ".jpg;" + HttpContext.Current.Session["usrName"].ToString() + ";" + strUsrRoleID;
                }
                if (File.Exists(HttpContext.Current.Server.MapPath("~/Images/Users/") + HttpContext.Current.Session["usrName"].ToString() + ".png"))
                {
                    return "/Images/Users/" + HttpContext.Current.Session["usrName"].ToString() + ".png;" + HttpContext.Current.Session["usrName"].ToString() + ";" + strUsrRoleID;
                }
                else
                {
                    return "/Images/System/user.jpg;User;" + strUsrRoleID;
                }
            }

            else
            {
                return "/Images/System/user.jpg;User" + strUsrRoleID;
            }


        }

        /// <summary>
        /// Method for write data option
        /// </summary>
        /// <param name="strTableName">Name of table</param>
        /// <returns></returns>
        [System.Web.Services.WebMethod]
        public static void Write_Data()
        {

        }

        /// <summary>
        /// Method to store current page in session variables
        /// </summary>
        /// <param name="strPageID">Page ID</param>
        /// <param name="strPageName">Page Name</param>
        [System.Web.Services.WebMethod]
        public static void DefineCurrentPage(string strPageID = "", string strPageName = "")
        {
            HttpContext.Current.Session["curPageID"] = strPageID;
            HttpContext.Current.Session["curPageName"] = strPageName;
        }

        /// <summary>
        /// Method to log out
        /// </summary>
        [System.Web.Services.WebMethod]
        public static void Logout_Click()
        {
            HttpContext.Current.Session.Clear();
            //Response.Redirect("Login");
        }

        /// <summary>
        /// Method to get image url for start page
        /// </summary>
        /// <returns></returns>
        [System.Web.Services.WebMethod]
        public static List<string> GetImageURL()
        {
            //Initialize variables
            Random rnd = new Random();
            int intRandomIndex = 0;
            string strPath = "";
            List<string> lstSourceURL = new List<string>();
            List<string> lstDestURL = new List<string>();
            DataTable dtContents = ExtServices.GetContents();

            //Retrieve content types
            if (dtContents != null && dtContents.Rows.Count > 0)
            {
                for (int index = 0; index < dtContents.Rows.Count; index++)
                {
                    //Add items different to countries and others
                    if (Convert.ToInt32(dtContents.Rows[index]["cntID"]) != 100 & Convert.ToInt32(dtContents.Rows[index]["cntID"]) < 600)
                    {
                        lstSourceURL.Add(dtContents.Rows[index]["cntName"].ToString());
                    }
                }

                lstSourceURL.Add("Artists");
            }
            //Check directory existence

            foreach (string folder in lstSourceURL)
            {
                if (!Directory.Exists(HttpContext.Current.Server.MapPath("~/Images/Content/" + folder + "/")))
                {
                    Directory.CreateDirectory(HttpContext.Current.Server.MapPath("~/Images/Content/" + folder + "/"));
                    Directory.CreateDirectory(HttpContext.Current.Server.MapPath("~/Images/Content/" + folder + "/Front/"));
                }

                //If directory is not empty
                if (Directory.EnumerateFileSystemEntries(HttpContext.Current.Server.MapPath("~/Images/Content/" + folder + "/Front/")).Any())
                {
                    //Get 8 paths per item
                    for (int index = 0; index < 8; index++)
                    {
                        var files = folder != "Artists" ? Directory.GetFiles(HttpContext.Current.Server.MapPath("~/Images/Content/" + folder + "/Front/"), "*.jpg") : Directory.GetFiles(HttpContext.Current.Server.MapPath("~/Images/Content/" + folder + "/Front/"), "*.png");
                        Array.Sort(files);
                        intRandomIndex = rnd.Next(files.Length);
                        strPath = "/Images/Content/" + folder + "/Front/" + Path.GetFileName(files[intRandomIndex]);
                        if (!lstDestURL.Contains(strPath))
                        {
                            lstDestURL.Add(strPath);
                        }
                        else
                        {
                            index--;
                        }
                    }
                }
            }

            lstDestURL = ShuffleArr(new Random(), lstDestURL);

            return ShuffleArr(new Random(), lstDestURL);
        }

        /// <summary>
        /// Method to shuffle an array
        /// </summary>
        /// <param name="random">Random number</param>
        /// <param name="list">List with values</param>
        /// <returns></returns>
        private static List<string> ShuffleArr(Random random, List<string> list)
        {
            int n = list.Count;
            while (n > 1)
            {
                int k = random.Next(n--);
                string temp = list[n];
                list[n] = list[k];
                list[k] = temp;
            }

            return list;
        }
    }
}