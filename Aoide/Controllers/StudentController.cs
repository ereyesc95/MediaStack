using System;
using System.Collections.Generic;
using System.Linq;
using System.Web;
using System.Web.Mvc;
using Aoide.Models;

namespace Aoide.Controllers
{
    [RoutePrefix("students")]
    public class StudentController : Controller
    {
        [Route("")]
        public ActionResult GetAllStudents()
        {
            var student = Students();
            return View(student);
        }

        [Route("{id:int:max(2)}")]
        public ActionResult GetStudent(int id)
        {
            var student = Students().FirstOrDefault(x => x.id == id);
            return View(student);
        }

        [Route("{id}/address")]
        public ActionResult GetStudentAddress(int id)
        {
            var studentAddress = Students().Where(x => x.id == id).Select(x => x.Address).FirstOrDefault();
            return View(studentAddress);
        }

        [Route("{id}")]
        public string MyString (string id)
        {
            return id;
        }

        //~ to bypass url prefix
        [Route("~/about-us")]
        [Route("~/aboutus")]
        public string AboutUs()
        {
            return "This is about us";
        }

        private List<Student> Students()
        {
            return new List<Student>()
            {
                new Student()
                {
                    id = 1,
                    Name = "Student 1",
                    Class = "First",
                    Address = new Address()
                    {
                        Id = 1,
                        Address1 = "Address for student 1",
                        City = "City for student 1",
                        HomeNumber = "11111"
                    }
                },
                new Student()
                {
                    id = 2,
                    Name = "Student 2",
                    Class = "Second",
                    Address = new Address()
                    {
                        Id = 1,
                        Address1 = "Address for student 2",
                        City = "City for student 2",
                        HomeNumber = "22222"
                    }
                },
            };

        }
    }
}