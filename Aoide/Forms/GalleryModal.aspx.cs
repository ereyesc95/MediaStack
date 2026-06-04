using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Web;
using System.Web.UI;
using System.Web.UI.WebControls;

namespace Aoide.Forms
{
    public partial class GalleryModal : System.Web.UI.Page
    {
        protected void Page_Load(object sender, EventArgs e)
        {
            string strCurrentImage = HttpContext.Current.Session["curImagePath"]!= null ? HttpContext.Current.Session["curImagePath"].ToString() : "";
            string strImagePaths = HttpContext.Current.Session["allImagePaths"] != null ? HttpContext.Current.Session["allImagePaths"].ToString() : "";
            imgMainImage.Src = strCurrentImage;
            imgBackGround.Src = strCurrentImage;
            inpImagePaths.Value = strImagePaths.Replace("%27", "\'");
            pImageTitle.InnerHtml = "";
            string strInnerHtml = Path.GetFileNameWithoutExtension(strCurrentImage).Replace("_H", "").Replace("_V", "").Replace("%20", " ").Replace(" Era", "").Replace(" Current", "").Replace("%2C", " -");
            strInnerHtml = Regex.Replace(strInnerHtml, @"(\d{4})\..*?\.", "$1.");
            pImageTitle.InnerHtml = strInnerHtml != "" ? strInnerHtml : "";
        }

        protected void submit_Click(object sender, EventArgs e)
        {
            return;
        }
    }
}