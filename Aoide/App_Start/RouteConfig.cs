using System;
using System.Collections.Generic;
using System.Web;
using System.Web.Mvc;
using System.Web.Routing;
using Microsoft.AspNet.FriendlyUrls;


namespace MediaBinger
{
    public static class RouteConfig
    {
        public static void RegisterRoutes(RouteCollection routes)
        {
            //var settings = new FriendlyUrlSettings();
            //settings.AutoRedirectMode = RedirectMode.Off;
            //routes.EnableFriendlyUrls(settings);

            routes.EnableFriendlyUrls();
            routes.MapPageRoute("", "Login", "~/Default.aspx");
            routes.MapPageRoute("", "Media", "~/Forms/Home.aspx");
            routes.MapPageRoute("", "Write", "~/Forms/Write.aspx");
            routes.MapPageRoute("GetPage", "Media/{PageName}", "~/Forms/PrimaryPage.aspx");
            routes.MapPageRoute("GetSubPage", "Media/{PageName}/{SubPageName}", "~/Forms/SecondaryPage.aspx");
            routes.MapPageRoute("GetThirdPage", "Media/{PageName}/{SubPageName}/{ThirdPageName}", "~/Forms/TertiaryPage.aspx");

            //routes.IgnoreRoute("{resource}.axd/{*pathInfo}");

            routes.MapMvcAttributeRoutes();
           // routes.MapRoute(
           //     name: "allStudents",
           //     url: "students",
           //     defaults: new { controller = "Student", action = "GetAllStudents"}
           // );

           // routes.MapRoute(
           //     name: "Student",
           //     url: "students/{id}",
           //     defaults: new { controller = "Student", action = "GetStudent" }
           // );

           // routes.MapRoute(
           //    name: "StudentAddress",
           //    url: "students/{id}/Address",
           //    defaults: new { controller = "Student", action = "GetStudentAddress" },
           //    constraints: new { id = @"\d+"}
           //);

            routes.MapRoute(
                    name: "Default",
                    url: "{controller}/{action}/{id}",
                    defaults: new { controller = "Home", action = "Index", id = UrlParameter.Optional }
                );  
        }
    }
}
