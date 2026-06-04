using Aoide.Models;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Web;
using System.Web.Mvc;

namespace Aoide.Controllers
{
    public class PageController : Controller
    {
        // GET: Page
        public ActionResult Index()
        {
            return View();
        }

        public ActionResult GetMainPages()
        {
            var artists = Artists();
            return View(artists);
        }

        public ActionResult GetMainItems(int id)
        {
            var artists = Artists().FirstOrDefault(x => x.id == id);
            return View(artists);
        }

        public ActionResult GetSubItems(int id)
        {
            var artists = Artists().Where(x => x.id == id).Select(x => x.Name);
            return View(artists);
        }

        private List<Artist> Artists()
        {
            return new List<Artist>()
            {
                new Artist()
                {
                    id = 1,
                    Name = "HIM",
                    Page = new Pages()
                    {
                        PageType = "Music",
                        Library = "No",
                        Movies = "No",
                        Music = "Yes",
                        Series = "No"
                    }
                },
                new Artist()
                {
                    id = 2,
                    Name = "The Rasmus",
                    Page = new Pages()
                    {
                        PageType = "Music",
                        Library = "No",
                        Movies = "No",
                        Music = "Yes",
                        Series = "No"
                    }
                },
            };

        }

        // GET: Page/Details/5
        public ActionResult Details(int id)
        {
            return View();
        }

        // GET: Page/Create
        public ActionResult Create()
        {
            return View();
        }

        // POST: Page/Create
        [HttpPost]
        public ActionResult Create(FormCollection collection)
        {
            try
            {
                // TODO: Add insert logic here

                return RedirectToAction("Index");
            }
            catch
            {
                return View();
            }
        }

        // GET: Page/Edit/5
        public ActionResult Edit(int id)
        {
            return View();
        }

        // POST: Page/Edit/5
        [HttpPost]
        public ActionResult Edit(int id, FormCollection collection)
        {
            try
            {
                // TODO: Add update logic here

                return RedirectToAction("Index");
            }
            catch
            {
                return View();
            }
        }

        // GET: Page/Delete/5
        public ActionResult Delete(int id)
        {
            return View();
        }

        // POST: Page/Delete/5
        [HttpPost]
        public ActionResult Delete(int id, FormCollection collection)
        {
            try
            {
                // TODO: Add delete logic here

                return RedirectToAction("Index");
            }
            catch
            {
                return View();
            }
        }
    }
}
